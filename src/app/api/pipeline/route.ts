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
  ContentType,
  Language,
  Platform,
  ScriptSection,
  ApiResponse,
  VideoType,
  VideoEngine,
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

// ─── Background pipeline processing ─────────────────────────────────────────

async function processPipeline(
  contentId: number,
  logId: number,
  body: PipelineRequest,
  language: Language,
) {
  const pipelineStart = Date.now();
  const steps: PipelineStepResult[] = [];
  const publishJobIds: number[] = [];

  // Premium mode flags
  const premiumMode = body.premium_mode === true;
  const usePremiumTTS = premiumMode || body.tts_provider === 'elevenlabs';
  const generateImg = premiumMode || body.generate_image === true;
  const generateBgm = (premiumMode || body.generate_bgm === true) && isMubertConfigured();

  let scriptSections: ScriptSection[] = [];

  function updateProgress(message: string, currentStep: string) {
    try {
      run(
        `UPDATE generation_logs SET output_result = ? WHERE id = ?`,
        [
          JSON.stringify({
            message,
            current_step: currentStep,
            steps_completed: steps.length,
            content_id: contentId,
          }),
          logId,
        ]
      );
    } catch {
      // best-effort progress update
    }
  }

  try {
    // ─── Step 1: Content already created ──────────────────────────────
    steps.push({
      step: 'content_create',
      status: 'success',
      duration_ms: 0,
      data: { content_id: contentId },
    });

    // ─── Step 2: Generate Script ─────────────────────────────────────
    updateProgress('스크립트 생성 중...', 'script');
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
      scriptSections = scriptResult.sections;

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
      throw new Error(`Script generation failed: ${msg}`);
    }

    // ─── Step 3: Generate Thumbnail Image (DALL-E 3) ─────────────────
    if (generateImg) {
      updateProgress('썸네일 이미지 생성 중...', 'image');
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
        steps.push({ step: 'image', status: 'failed', duration_ms: Date.now() - step3Start, error: msg });
      }
    } else {
      steps.push({ step: 'image', status: 'skipped' });
    }

    // ─── Step 4: Generate TTS (ElevenLabs or edge-tts) ───────────────
    updateProgress('음성(TTS) 생성 중...', 'tts');
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
        try {
          const projectRoot = process.cwd();
          const premiumAudioPath = path.join(projectRoot, 'output', 'audio', `${contentId}.mp3`);

          const premiumResult = await generatePremiumTTS({
            text: content.script,
            outputPath: premiumAudioPath,
          });

          audioPath = premiumResult.audioPath;
          subtitlePath = path.join(projectRoot, 'output', 'subtitles', `${contentId}.vtt`);
          const { writeFileSync, mkdirSync, existsSync } = await import('fs');
          const subtitleDir = path.dirname(subtitlePath);
          if (!existsSync(subtitleDir)) mkdirSync(subtitleDir, { recursive: true });
          writeFileSync(subtitlePath, 'WEBVTT\n\n');
        } catch (elevenLabsErr) {
          console.warn('[Pipeline] ElevenLabs failed, falling back to edge-tts:', elevenLabsErr);
          const ttsResult = await generateTTS(content.script, contentId);
          audioPath = ttsResult.audioPath;
          subtitlePath = ttsResult.subtitlePath;
        }
      } else {
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
      throw new Error(`TTS generation failed: ${msg}`);
    }

    // ─── Step 5: Generate BGM (Mubert) - Only if configured ──────────
    let bgmPath: string | null = null;
    if (generateBgm) {
      updateProgress('배경음악(BGM) 생성 중...', 'bgm');
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
        steps.push({ step: 'bgm', status: 'failed', duration_ms: Date.now() - step5Start, error: msg });
      }
    } else {
      const skipReason = !isMubertConfigured() ? 'Mubert not configured' : 'not requested';
      steps.push({ step: 'bgm', status: 'skipped', data: { reason: skipReason } });
    }

    // ─── Step 6: Generate Video ─────────────────────────────────────
    const videoType: VideoType = body.video_type || 'heygen';
    const videoEngine: VideoEngine = body.video_engine || 'kling';
    const useHeyGen = videoType === 'heygen' && !!process.env.HEYGEN_API_KEY;

    updateProgress(
      useHeyGen ? 'HeyGen 아바타 영상 생성 중...' : '영상 생성 중...',
      'video'
    );

    const step6Start = Date.now();
    try {
      const content = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [contentId]);

      if (useHeyGen) {
        if (!content?.script) throw new Error('No script found');

        const stepName = 'heygen';
        run(
          `INSERT INTO generation_logs (content_id, step, status) VALUES (?, ?, 'started')`,
          [contentId, stepName]
        );

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
        if (!content?.audio_path) throw new Error('No audio found');

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
          videoEngine,
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
        updateProgress('HeyGen 실패, 슬라이드쇼로 대체 생성 중...', 'video_fallback');
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
              videoEngine,
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
          throw new Error(`Video generation failed (HeyGen + slideshow fallback): ${msg} | ${fallbackMsg}`);
        }
      } else {
        throw new Error(`Video generation failed: ${msg}`);
      }
    }

    // ─── Step 7: Caption & Hashtag Generation ────────────────────────
    let captionText: string | null = null;
    let hashtags: string[] = [];

    if (body.auto_caption !== false && body.platforms && body.platforms.length > 0) {
      updateProgress('캡션 & 해시태그 생성 중...', 'caption');
      const step7Start = Date.now();
      try {
        const content = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [contentId]);
        if (!content?.script) throw new Error('No script found for caption generation');

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
        steps.push({ step: 'caption', status: 'failed', duration_ms: Date.now() - step7Start, error: msg });
      }
    } else {
      steps.push({ step: 'caption', status: 'skipped' });
    }

    // ─── Step 8: Schedule Publishing ─────────────────────────────────
    if (body.platforms && body.platforms.length > 0) {
      updateProgress('배포 예약 설정 중...', 'publish_schedule');
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
        throw new Error(`Publish scheduling failed: ${msg}`);
      }
    } else {
      steps.push({ step: 'publish_schedule', status: 'skipped' });
    }

    // ─── Pipeline Complete ───────────────────────────────────────────
    const totalDuration = Date.now() - pipelineStart;

    run(
      `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms)
       VALUES (?, 'pipeline', 'completed', ?, ?)`,
      [contentId, JSON.stringify({ steps: steps.length, publishJobs: publishJobIds.length }), totalDuration]
    );

    // Mark the pipeline log as completed
    run(
      `UPDATE generation_logs SET status = 'completed', output_result = ?, duration_ms = ? WHERE id = ?`,
      [
        JSON.stringify({
          message: '파이프라인 완료!',
          content_id: contentId,
          steps,
          publish_job_ids: publishJobIds,
          total_duration_ms: totalDuration,
        }),
        totalDuration,
        logId,
      ]
    );

    console.log(`[Pipeline] Background processing completed for content ${contentId} (${totalDuration}ms)`);
  } catch (error) {
    const totalDuration = Date.now() - pipelineStart;
    const msg = error instanceof Error ? error.message : 'Unknown error';

    // Mark the pipeline log as failed
    run(
      `UPDATE generation_logs SET status = 'failed', error_message = ?, duration_ms = ? WHERE id = ?`,
      [msg, totalDuration, logId]
    );

    console.error(`[Pipeline] Background processing failed for content ${contentId}: ${msg}`);
  }
}

// ─── POST /api/pipeline ─────────────────────────────────────────────────────

export async function POST(request: Request) {
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

    // ─── Step 1: Create Content ──────────────────────────────────────
    let contentId: number;
    try {
      const result = run(
        `INSERT INTO contents (title, content_type, language) VALUES (?, ?, ?)`,
        [body.topic, body.content_type, language]
      );
      contentId = Number(result.lastInsertRowid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({
        success: false,
        error: `Content creation failed: ${msg}`,
      } satisfies ApiResponse, { status: 500 });
    }

    // Create pipeline log with 'started' status
    const logResult = run(
      `INSERT INTO generation_logs (content_id, step, status, input_params, output_result) VALUES (?, 'pipeline', 'started', ?, ?)`,
      [
        contentId,
        JSON.stringify(body),
        JSON.stringify({
          message: '파이프라인 시작...',
          current_step: 'init',
          steps_completed: 0,
          content_id: contentId,
        }),
      ]
    );

    const logId = Number(logResult.lastInsertRowid);

    // Start background processing (fire-and-forget)
    processPipeline(contentId, logId, body, language).catch((err) => {
      console.error(`[Pipeline] Unhandled error in background processing:`, err);
    });

    // Return immediately with task info
    return Response.json({
      success: true,
      data: {
        task_id: logId,
        content_id: contentId,
        status: 'processing',
        message: '파이프라인이 시작되었습니다. 상태를 폴링하세요.',
      },
    } satisfies ApiResponse, { status: 202 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
