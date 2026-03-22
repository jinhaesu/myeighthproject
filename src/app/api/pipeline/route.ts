import { queryOne, run } from '@/lib/db';
import { generateScript } from '@/lib/claude';
import { generateTTS } from '@/lib/tts';
import { generateVideo } from '@/lib/video';
import { generateCaption } from '@/lib/caption';
import type {
  PipelineRequest,
  PipelineStepResult,
  PipelineResult,
  ContentType,
  Language,
  Platform,
  ApiResponse,
} from '@/types';

// ─── Helper: row types ──────────────────────────────────────────────────────

interface ContentRow {
  id: number;
  title: string;
  content_type: ContentType;
  language: Language;
  script: string | null;
  audio_path: string | null;
  subtitle_path: string | null;
  video_path: string | null;
}

interface PlatformAccountRow {
  id: number;
  platform: Platform;
}

// ─── POST /api/pipeline ─────────────────────────────────────────────────────

export async function POST(request: Request) {
  const pipelineStart = Date.now();

  try {
    const body: PipelineRequest = await request.json();

    // Validate
    if (!body.content_type || !body.topic) {
      return Response.json(
        { success: false, error: 'content_type and topic are required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const validTypes = ['health_info', 'recipe', 'nutrition_tip'];
    if (!validTypes.includes(body.content_type)) {
      return Response.json(
        { success: false, error: `content_type must be one of: ${validTypes.join(', ')}` } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const language: Language = body.language || 'ko';
    const steps: PipelineStepResult[] = [];
    const publishJobIds: number[] = [];

    // ─── Step 1: Create Content ──────────────────────────────────────────
    const step1Start = Date.now();
    let contentId: number;
    try {
      const result = run(
        `INSERT INTO contents (title, content_type, language) VALUES (?, ?, ?)`,
        [body.topic, body.content_type, language]
      );
      contentId = Number(result.lastInsertRowid);

      run(
        `INSERT INTO generation_logs (content_id, step, status, input_params, duration_ms)
         VALUES (?, 'pipeline', 'started', ?, ?)`,
        [contentId, JSON.stringify(body), Date.now() - step1Start]
      );

      steps.push({
        step: 'content_create',
        status: 'success',
        duration_ms: Date.now() - step1Start,
        data: { content_id: contentId },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      steps.push({ step: 'content_create', status: 'failed', duration_ms: Date.now() - step1Start, error: msg });
      return Response.json({
        success: false,
        error: `Content creation failed: ${msg}`,
        data: { steps, publish_job_ids: [], total_duration_ms: Date.now() - pipelineStart },
      } satisfies ApiResponse, { status: 500 });
    }

    // ─── Step 2: Generate Script ─────────────────────────────────────────
    const step2Start = Date.now();
    try {
      run(
        `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'script', 'started', ?)`,
        [contentId, JSON.stringify({ topic: body.topic })]
      );

      const scriptResult = await generateScript(body.content_type, body.topic, {
        language,
      });

      const step2Duration = Date.now() - step2Start;

      run(
        `UPDATE contents SET script = ?, sections = ?, status = 'script_ready', tags = COALESCE(tags, ?) WHERE id = ?`,
        [scriptResult.fullScript, JSON.stringify(scriptResult.sections), JSON.stringify(scriptResult.tags), contentId]
      );

      run(
        `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
         VALUES (?, 'script', 'completed', ?, ?)`,
        [contentId, JSON.stringify({ title: scriptResult.title, sectionCount: scriptResult.sections.length }), step2Duration]
      );

      steps.push({
        step: 'script',
        status: 'success',
        duration_ms: step2Duration,
        data: { title: scriptResult.title, totalDuration: scriptResult.totalDuration },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      run(
        `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'script', 'failed', ?, ?)`,
        [contentId, msg, Date.now() - step2Start]
      );
      steps.push({ step: 'script', status: 'failed', duration_ms: Date.now() - step2Start, error: msg });
      return Response.json({
        success: false,
        error: `Script generation failed: ${msg}`,
        data: { content_id: contentId, steps, publish_job_ids: [], total_duration_ms: Date.now() - pipelineStart },
      } satisfies ApiResponse, { status: 500 });
    }

    // ─── Step 3: Generate TTS ────────────────────────────────────────────
    const step3Start = Date.now();
    try {
      const content = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [contentId]);
      if (!content?.script) throw new Error('No script found after generation');

      run(
        `INSERT INTO generation_logs (content_id, step, status) VALUES (?, 'tts', 'started')`,
        [contentId]
      );

      const ttsResult = await generateTTS(content.script, contentId);
      const step3Duration = Date.now() - step3Start;

      run(
        `UPDATE contents SET audio_path = ?, subtitle_path = ?, status = 'audio_ready' WHERE id = ?`,
        [ttsResult.audioPath, ttsResult.subtitlePath, contentId]
      );

      run(
        `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
         VALUES (?, 'tts', 'completed', ?, ?)`,
        [contentId, JSON.stringify({ audioPath: ttsResult.audioPath, voice: ttsResult.voice }), step3Duration]
      );

      steps.push({
        step: 'tts',
        status: 'success',
        duration_ms: step3Duration,
        data: { audioPath: ttsResult.audioPath },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      run(
        `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'tts', 'failed', ?, ?)`,
        [contentId, msg, Date.now() - step3Start]
      );
      steps.push({ step: 'tts', status: 'failed', duration_ms: Date.now() - step3Start, error: msg });
      return Response.json({
        success: false,
        error: `TTS generation failed: ${msg}`,
        data: { content_id: contentId, steps, publish_job_ids: [], total_duration_ms: Date.now() - pipelineStart },
      } satisfies ApiResponse, { status: 500 });
    }

    // ─── Step 4: Generate Video ──────────────────────────────────────────
    const step4Start = Date.now();
    try {
      const content = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [contentId]);
      if (!content?.audio_path || !content?.subtitle_path) throw new Error('No audio/subtitle found');

      run(
        `INSERT INTO generation_logs (content_id, step, status) VALUES (?, 'video', 'started')`,
        [contentId]
      );

      const videoResult = await generateVideo(contentId, content.audio_path, content.subtitle_path);
      const step4Duration = Date.now() - step4Start;

      run(
        `UPDATE contents SET video_path = ?, status = 'video_ready' WHERE id = ?`,
        [videoResult.videoPath, contentId]
      );

      run(
        `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
         VALUES (?, 'video', 'completed', ?, ?)`,
        [contentId, JSON.stringify({ videoPath: videoResult.videoPath, videoSizeBytes: videoResult.videoSizeBytes }), step4Duration]
      );

      steps.push({
        step: 'video',
        status: 'success',
        duration_ms: step4Duration,
        data: { videoPath: videoResult.videoPath },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      run(
        `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'video', 'failed', ?, ?)`,
        [contentId, msg, Date.now() - step4Start]
      );
      steps.push({ step: 'video', status: 'failed', duration_ms: Date.now() - step4Start, error: msg });
      return Response.json({
        success: false,
        error: `Video generation failed: ${msg}`,
        data: { content_id: contentId, steps, publish_job_ids: [], total_duration_ms: Date.now() - pipelineStart },
      } satisfies ApiResponse, { status: 500 });
    }

    // ─── Step 5: Caption & Hashtag Generation ────────────────────────────
    let captionText: string | null = null;
    let hashtags: string[] = [];

    if (body.auto_caption !== false && body.platforms && body.platforms.length > 0) {
      const step5Start = Date.now();
      try {
        const content = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [contentId]);
        if (!content?.script) throw new Error('No script found for caption generation');

        // Get the first platform's type for caption style
        const firstPlatformRow = queryOne<PlatformAccountRow>(
          'SELECT id, platform FROM platform_accounts WHERE id = ?',
          [body.platforms[0]]
        );
        const platformType: Platform = firstPlatformRow?.platform || 'instagram';

        run(
          `INSERT INTO generation_logs (content_id, step, status) VALUES (?, 'caption', 'started')`,
          [contentId]
        );

        const captionResult = await generateCaption(content.script, platformType, language);
        const step5Duration = Date.now() - step5Start;

        captionText = captionResult.caption;
        hashtags = captionResult.hashtags;

        run(
          `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
           VALUES (?, 'caption', 'completed', ?, ?)`,
          [contentId, JSON.stringify({ captionLength: captionText.length, hashtagCount: hashtags.length }), step5Duration]
        );

        steps.push({
          step: 'caption',
          status: 'success',
          duration_ms: step5Duration,
          data: { captionLength: captionText.length, hashtagCount: hashtags.length },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        run(
          `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'caption', 'failed', ?, ?)`,
          [contentId, msg, Date.now() - step5Start]
        );
        // Caption failure is non-fatal, continue pipeline
        steps.push({ step: 'caption', status: 'failed', duration_ms: Date.now() - step5Start, error: msg });
      }
    } else {
      steps.push({ step: 'caption', status: 'skipped' });
    }

    // ─── Step 6: Schedule Publishing ─────────────────────────────────────
    if (body.platforms && body.platforms.length > 0) {
      const step6Start = Date.now();
      try {
        const scheduledAt = body.scheduled_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        for (const platformAccountId of body.platforms) {
          const result = run(
            `INSERT INTO publish_jobs (content_id, platform_account_id, scheduled_at, caption, hashtags)
             VALUES (?, ?, ?, ?, ?)`,
            [
              contentId,
              platformAccountId,
              scheduledAt,
              captionText,
              hashtags.length > 0 ? JSON.stringify(hashtags) : null,
            ]
          );
          publishJobIds.push(Number(result.lastInsertRowid));
        }

        steps.push({
          step: 'publish_schedule',
          status: 'success',
          duration_ms: Date.now() - step6Start,
          data: { job_count: publishJobIds.length, scheduled_at: scheduledAt },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        steps.push({ step: 'publish_schedule', status: 'failed', duration_ms: Date.now() - step6Start, error: msg });
        return Response.json({
          success: false,
          error: `Publish scheduling failed: ${msg}`,
          data: { content_id: contentId, steps, publish_job_ids: publishJobIds, total_duration_ms: Date.now() - pipelineStart },
        } satisfies ApiResponse, { status: 500 });
      }
    } else {
      steps.push({ step: 'publish_schedule', status: 'skipped' });
    }

    // ─── Pipeline Complete ───────────────────────────────────────────────
    const totalDuration = Date.now() - pipelineStart;

    run(
      `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
       VALUES (?, 'pipeline', 'completed', ?, ?)`,
      [contentId, JSON.stringify({ steps: steps.length, publishJobs: publishJobIds.length }), totalDuration]
    );

    const result: PipelineResult = {
      content_id: contentId,
      steps,
      publish_job_ids: publishJobIds,
      total_duration_ms: totalDuration,
    };

    return Response.json({
      success: true,
      data: result,
    } satisfies ApiResponse<PipelineResult>, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
