import path from 'path';
import { queryOne, run } from '@/lib/db';
import { generateScript } from '@/lib/claude';
import { generateTTS } from '@/lib/tts';
import { generatePremiumTTS } from '@/lib/elevenlabs';
import { generateImage } from '@/lib/image';
import { generateBGM } from '@/lib/mubert';
import { generateVideo } from '@/lib/video';
import { generateHeyGenVideo } from '@/lib/heygen';
import { generateCaption } from '@/lib/caption';
import type {
  PipelineRequest,
  PipelineStepResult,
  PipelineResult,
  ContentType,
  Language,
  Platform,
  ScriptSection,
  ApiResponse,
  VideoType,
} from '@/types';

// ─── Helper: row types ──────────────────────────────────────────────────────

interface ContentRow {
  id: number;
  title: string;
  content_type: ContentType;
  language: Language;
  script: string | null;
  sections: string | null;
  audio_path: string | null;
  subtitle_path: string | null;
  video_path: string | null;
  thumbnail_path: string | null;
}

interface PlatformAccountRow {
  id: number;
  platform: Platform;
}

// ─── Helper: check if Mubert is configured ──────────────────────────────────

function isMubertConfigured(): boolean {
  return !!(process.env.MUBERT_EMAIL && process.env.MUBERT_API_TOKEN);
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

    // Premium mode flags
    const premiumMode = body.premium_mode === true;
    const usePremiumTTS = premiumMode || body.tts_provider === 'elevenlabs';
    const generateImg = premiumMode || body.generate_image === true;
    // BGM only if explicitly requested AND Mubert is configured
    const generateBgm = (premiumMode || body.generate_bgm === true) && isMubertConfigured();

    // Track sections for later use in video generation
    let scriptSections: ScriptSection[] = [];

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

      // Store sections for video generation
      scriptSections = scriptResult.sections;

      // Duration warning
      if (scriptResult.totalDuration > 60) {
        console.warn(`[Pipeline] Script duration (${scriptResult.totalDuration}s) exceeds 60s short-form limit for content ${contentId}`);
      }

      run(
        `UPDATE contents SET script = ?, sections = ?, status = 'script_ready', tags = COALESCE(tags, ?) WHERE id = ?`,
        [scriptResult.fullScript, JSON.stringify(scriptResult.sections), JSON.stringify(scriptResult.tags), contentId]
      );

      run(
        `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
         VALUES (?, 'script', 'completed', ?, ?)`,
        [contentId, JSON.stringify({ title: scriptResult.title, sectionCount: scriptResult.sections.length, totalDuration: scriptResult.totalDuration }), step2Duration]
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

    // ─── Step 3: Generate Thumbnail Image (DALL-E 3) ─────────────────────
    // This is for the thumbnail only; section images are generated inside video step
    if (generateImg) {
      const step3Start = Date.now();
      try {
        run(
          `INSERT INTO generation_logs (content_id, step, status) VALUES (?, 'image', 'started')`,
          [contentId]
        );

        const projectRoot = process.cwd();
        const imagePath = path.join(projectRoot, 'output', 'images', `${contentId}.png`);

        const imageResult = await generateImage({
          prompt: `Korean health food brand "Nuldam" thumbnail for: ${body.topic}. Clean, modern, professional food photography style. High quality, appetizing, warm lighting, 9:16 aspect ratio suitable for short-form video.`,
          style: 'vivid',
          size: '1024x1792',
          outputPath: imagePath,
        });

        const step3Duration = Date.now() - step3Start;

        run(
          `UPDATE contents SET thumbnail_path = ? WHERE id = ?`,
          [imageResult.imagePath, contentId]
        );

        run(
          `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
           VALUES (?, 'image', 'completed', ?, ?)`,
          [contentId, JSON.stringify({ imagePath: imageResult.imagePath }), step3Duration]
        );

        steps.push({
          step: 'image',
          status: 'success',
          duration_ms: step3Duration,
          data: { imagePath: imageResult.imagePath, revisedPrompt: imageResult.revisedPrompt },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        run(
          `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'image', 'failed', ?, ?)`,
          [contentId, msg, Date.now() - step3Start]
        );
        // Image failure is non-fatal, continue pipeline
        steps.push({ step: 'image', status: 'failed', duration_ms: Date.now() - step3Start, error: msg });
      }
    } else {
      steps.push({ step: 'image', status: 'skipped' });
    }

    // ─── Step 4: Generate TTS (ElevenLabs or edge-tts) ───────────────────
    const step4Start = Date.now();
    try {
      const content = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [contentId]);
      if (!content?.script) throw new Error('No script found after generation');

      run(
        `INSERT INTO generation_logs (content_id, step, status) VALUES (?, 'tts', 'started')`,
        [contentId]
      );

      let audioPath: string;
      let subtitlePath: string;

      if (usePremiumTTS) {
        // Try ElevenLabs first
        try {
          const projectRoot = process.cwd();
          const premiumAudioPath = path.join(projectRoot, 'output', 'audio', `${contentId}.mp3`);

          const premiumResult = await generatePremiumTTS({
            text: content.script,
            outputPath: premiumAudioPath,
          });

          audioPath = premiumResult.audioPath;
          // ElevenLabs doesn't produce subtitles, generate empty VTT
          subtitlePath = path.join(projectRoot, 'output', 'subtitles', `${contentId}.vtt`);
          const { writeFileSync, mkdirSync, existsSync } = await import('fs');
          const subtitleDir = path.dirname(subtitlePath);
          if (!existsSync(subtitleDir)) mkdirSync(subtitleDir, { recursive: true });
          writeFileSync(subtitlePath, 'WEBVTT\n\n');
        } catch (elevenLabsErr) {
          // Fallback to edge-tts
          console.warn('[Pipeline] ElevenLabs failed, falling back to edge-tts:', elevenLabsErr);
          const ttsResult = await generateTTS(content.script, contentId);
          audioPath = ttsResult.audioPath;
          subtitlePath = ttsResult.subtitlePath;
        }
      } else {
        // Use edge-tts
        const ttsResult = await generateTTS(content.script, contentId);
        audioPath = ttsResult.audioPath;
        subtitlePath = ttsResult.subtitlePath;
      }

      const step4Duration = Date.now() - step4Start;

      run(
        `UPDATE contents SET audio_path = ?, subtitle_path = ?, status = 'audio_ready' WHERE id = ?`,
        [audioPath, subtitlePath, contentId]
      );

      run(
        `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
         VALUES (?, 'tts', 'completed', ?, ?)`,
        [contentId, JSON.stringify({ audioPath, provider: usePremiumTTS ? 'elevenlabs' : 'edge-tts' }), step4Duration]
      );

      steps.push({
        step: 'tts',
        status: 'success',
        duration_ms: step4Duration,
        data: { audioPath, provider: usePremiumTTS ? 'elevenlabs' : 'edge-tts' },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      run(
        `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'tts', 'failed', ?, ?)`,
        [contentId, msg, Date.now() - step4Start]
      );
      steps.push({ step: 'tts', status: 'failed', duration_ms: Date.now() - step4Start, error: msg });
      return Response.json({
        success: false,
        error: `TTS generation failed: ${msg}`,
        data: { content_id: contentId, steps, publish_job_ids: [], total_duration_ms: Date.now() - pipelineStart },
      } satisfies ApiResponse, { status: 500 });
    }

    // ─── Step 5: Generate BGM (Mubert) - Only if configured ──────────────
    let bgmPath: string | null = null;
    if (generateBgm) {
      const step5Start = Date.now();
      try {
        run(
          `INSERT INTO generation_logs (content_id, step, status) VALUES (?, 'bgm', 'started')`,
          [contentId]
        );

        const projectRoot = process.cwd();
        const bgmOutputPath = path.join(projectRoot, 'output', 'music', `${contentId}.mp3`);

        const bgmResult = await generateBGM({
          prompt: `calm healthy food cooking background music for Korean health brand, gentle, warm, positive`,
          duration: 60,
          outputPath: bgmOutputPath,
        });

        bgmPath = bgmResult.bgmPath;
        const step5Duration = Date.now() - step5Start;

        run(
          `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
           VALUES (?, 'bgm', 'completed', ?, ?)`,
          [contentId, JSON.stringify({ bgmPath: bgmResult.bgmPath, durationSec: bgmResult.durationSec }), step5Duration]
        );

        steps.push({
          step: 'bgm',
          status: 'success',
          duration_ms: step5Duration,
          data: { bgmPath: bgmResult.bgmPath },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        run(
          `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'bgm', 'failed', ?, ?)`,
          [contentId, msg, Date.now() - step5Start]
        );
        // BGM failure is non-fatal, continue pipeline
        steps.push({ step: 'bgm', status: 'failed', duration_ms: Date.now() - step5Start, error: msg });
      }
    } else {
      const skipReason = !isMubertConfigured() ? 'Mubert not configured' : 'not requested';
      steps.push({ step: 'bgm', status: 'skipped', data: { reason: skipReason } });
    }

    // ─── Step 6: Generate Video ─────────────────────────────────────────
    // Determine video type: 'heygen' (default/recommended) or 'slideshow'
    const videoType: VideoType = body.video_type || 'heygen';
    const useHeyGen = videoType === 'heygen' && !!process.env.HEYGEN_API_KEY;

    const step6Start = Date.now();
    try {
      const content = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [contentId]);

      if (useHeyGen) {
        // ─── HeyGen Avatar Video ──────────────────────────────────────
        if (!content?.script) throw new Error('No script found');

        const stepName = 'heygen';
        run(
          `INSERT INTO generation_logs (content_id, step, status) VALUES (?, ?, 'started')`,
          [contentId, stepName]
        );

        // Build script text from sections or raw
        let scriptText = content.script;
        if (scriptSections.length > 0) {
          scriptText = scriptSections.map((s) => s.body).join('\n\n');
        }

        const isProduction = process.env.NODE_ENV === 'production';
        const outBase = isProduction ? '/tmp' : process.cwd();
        const videoPath = path.join(outBase, 'output', 'videos', `${contentId}_heygen.mp4`);

        const heygenResult = await generateHeyGenVideo({
          script: scriptText,
          language: language,
          avatarId: body.avatar_id,
          outputPath: videoPath,
        });

        const step6Duration = Date.now() - step6Start;

        run(
          `UPDATE contents SET video_path = ?, status = 'video_ready' WHERE id = ?`,
          [heygenResult.videoPath, contentId]
        );

        run(
          `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
           VALUES (?, ?, 'completed', ?, ?)`,
          [contentId, stepName, JSON.stringify({
            videoPath: heygenResult.videoPath,
            videoId: heygenResult.videoId,
            durationSec: heygenResult.durationSec,
            videoType: 'heygen',
          }), step6Duration]
        );

        steps.push({
          step: 'video',
          status: 'success',
          duration_ms: step6Duration,
          data: {
            videoPath: heygenResult.videoPath,
            videoType: 'heygen',
            videoId: heygenResult.videoId,
          },
        });
      } else {
        // ─── Slideshow Video (DALL-E + Kling) ──────────────────────────
        if (!content?.audio_path) throw new Error('No audio found');

        run(
          `INSERT INTO generation_logs (content_id, step, status) VALUES (?, 'video', 'started')`,
          [contentId]
        );

        // Prepare sections for slideshow (include visual_prompt for DALL-E/Kling)
        let videoSections: Array<{ body: string; visual_prompt?: string; duration_seconds: number }> | undefined;

        if (scriptSections.length > 0) {
          videoSections = scriptSections.map((s) => ({
            body: s.body,
            visual_prompt: s.visual_prompt,
            duration_seconds: s.duration_seconds,
          }));
        }

        // Generate video with integrated DALL-E slideshow
        const videoResult = await generateVideo(contentId, content.audio_path, content.subtitle_path, {
          backgroundImage: content.thumbnail_path || undefined,
          sections: videoSections,
          generateImages: true, // Always generate images for slideshow in pipeline
        });
        const step6Duration = Date.now() - step6Start;

        run(
          `UPDATE contents SET video_path = ?, status = 'video_ready' WHERE id = ?`,
          [videoResult.videoPath, contentId]
        );

        run(
          `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
           VALUES (?, 'video', 'completed', ?, ?)`,
          [contentId, JSON.stringify({
            videoPath: videoResult.videoPath,
            videoSizeBytes: videoResult.videoSizeBytes,
            durationSeconds: videoResult.durationSeconds,
            slideshowMode: !!videoSections,
            sectionCount: videoSections?.length ?? 0,
            videoType: 'slideshow',
          }), step6Duration]
        );

        steps.push({
          step: 'video',
          status: 'success',
          duration_ms: step6Duration,
          data: {
            videoPath: videoResult.videoPath,
            videoType: 'slideshow',
            slideshowMode: !!videoSections,
            ...(videoResult.durationSeconds > 60 && {
              durationWarning: `Video duration (${Math.round(videoResult.durationSeconds)}s) exceeds 60s short-form limit`,
            }),
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const logStep = useHeyGen ? 'heygen' : 'video';
      run(
        `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, ?, 'failed', ?, ?)`,
        [contentId, logStep, msg, Date.now() - step6Start]
      );
      steps.push({ step: 'video', status: 'failed', duration_ms: Date.now() - step6Start, error: msg });

      // If HeyGen fails, try fallback to slideshow
      if (useHeyGen) {
        console.warn(`[Pipeline] HeyGen failed, falling back to slideshow: ${msg}`);
        const fallbackStart = Date.now();
        try {
          const content = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [contentId]);
          if (content?.audio_path) {
            run(
              `INSERT INTO generation_logs (content_id, step, status) VALUES (?, 'video', 'started')`,
              [contentId]
            );

            let videoSections: Array<{ body: string; visual_prompt?: string; duration_seconds: number }> | undefined;
            if (scriptSections.length > 0) {
              videoSections = scriptSections.map((s) => ({
                body: s.body,
                visual_prompt: s.visual_prompt,
                duration_seconds: s.duration_seconds,
              }));
            }

            const videoResult = await generateVideo(contentId, content.audio_path, content.subtitle_path, {
              backgroundImage: content.thumbnail_path || undefined,
              sections: videoSections,
              generateImages: true,
            });
            const fallbackDuration = Date.now() - fallbackStart;

            run(
              `UPDATE contents SET video_path = ?, status = 'video_ready' WHERE id = ?`,
              [videoResult.videoPath, contentId]
            );

            run(
              `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
               VALUES (?, 'video', 'completed', ?, ?)`,
              [contentId, JSON.stringify({
                videoPath: videoResult.videoPath,
                videoType: 'slideshow',
                fallbackFromHeyGen: true,
              }), fallbackDuration]
            );

            // Replace the failed step with success
            steps[steps.length - 1] = {
              step: 'video',
              status: 'success',
              duration_ms: fallbackDuration,
              data: { videoPath: videoResult.videoPath, videoType: 'slideshow', fallbackFromHeyGen: true },
            };
          }
        } catch (fallbackErr) {
          const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          console.error(`[Pipeline] Slideshow fallback also failed: ${fallbackMsg}`);
          return Response.json({
            success: false,
            error: `Video generation failed (HeyGen + slideshow fallback): ${msg} | ${fallbackMsg}`,
            data: { content_id: contentId, steps, publish_job_ids: [], total_duration_ms: Date.now() - pipelineStart },
          } satisfies ApiResponse, { status: 500 });
        }
      } else {
        return Response.json({
          success: false,
          error: `Video generation failed: ${msg}`,
          data: { content_id: contentId, steps, publish_job_ids: [], total_duration_ms: Date.now() - pipelineStart },
        } satisfies ApiResponse, { status: 500 });
      }
    }

    // ─── Step 7: Caption & Hashtag Generation ────────────────────────────
    let captionText: string | null = null;
    let hashtags: string[] = [];

    if (body.auto_caption !== false && body.platforms && body.platforms.length > 0) {
      const step7Start = Date.now();
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
        const step7Duration = Date.now() - step7Start;

        captionText = captionResult.caption;
        hashtags = captionResult.hashtags;

        run(
          `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
           VALUES (?, 'caption', 'completed', ?, ?)`,
          [contentId, JSON.stringify({ captionLength: captionText.length, hashtagCount: hashtags.length }), step7Duration]
        );

        steps.push({
          step: 'caption',
          status: 'success',
          duration_ms: step7Duration,
          data: { captionLength: captionText.length, hashtagCount: hashtags.length },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        run(
          `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'caption', 'failed', ?, ?)`,
          [contentId, msg, Date.now() - step7Start]
        );
        // Caption failure is non-fatal, continue pipeline
        steps.push({ step: 'caption', status: 'failed', duration_ms: Date.now() - step7Start, error: msg });
      }
    } else {
      steps.push({ step: 'caption', status: 'skipped' });
    }

    // ─── Step 8: Schedule Publishing ─────────────────────────────────────
    if (body.platforms && body.platforms.length > 0) {
      const step8Start = Date.now();
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
          duration_ms: Date.now() - step8Start,
          data: { job_count: publishJobIds.length, scheduled_at: scheduledAt },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        steps.push({ step: 'publish_schedule', status: 'failed', duration_ms: Date.now() - step8Start, error: msg });
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
