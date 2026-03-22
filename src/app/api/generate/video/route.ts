import { queryOne, run } from '@/lib/db';
import { generateVideo } from '@/lib/video';
import type {
  GenerateVideoRequest,
  ApiResponse,
  ScriptSection,
  VideoEngine,
} from '@/types';

interface ContentRow {
  id: number;
  audio_path: string | null;
  subtitle_path: string | null;
  sections: string | null;
  status: string;
}

// ─── Background processing function ─────────────────────────────────────────

async function processVideoGeneration(
  contentId: number,
  logId: number,
  audioPath: string,
  subtitlePath: string | null,
  options: {
    backgroundColor?: string;
    backgroundImage?: string;
    fontSize?: number;
    sections?: Array<{ body: string; visual_prompt?: string; duration_seconds: number }>;
    generateImages: boolean;
    videoEngine: VideoEngine;
  }
) {
  const startTime = Date.now();

  try {
    // Update progress: starting
    run(
      `UPDATE generation_logs SET output_result = ? WHERE id = ?`,
      [
        JSON.stringify({
          current_section: 0,
          total_sections: options.sections?.length ?? 0,
          message: '영상 생성 시작...',
        }),
        logId,
      ]
    );

    // Generate video (this takes a long time)
    const result = await generateVideo(contentId, audioPath, subtitlePath, {
      backgroundColor: options.backgroundColor,
      backgroundImage: options.backgroundImage,
      fontSize: options.fontSize,
      sections: options.sections,
      generateImages: options.generateImages,
      videoEngine: options.videoEngine,
    });

    const durationMs = Date.now() - startTime;

    // Update content
    run(
      `UPDATE contents SET video_path = ?, status = 'video_ready' WHERE id = ?`,
      [result.videoPath, contentId]
    );

    // Mark log as completed
    run(
      `UPDATE generation_logs SET status = 'completed', output_result = ?, duration_ms = ? WHERE id = ?`,
      [
        JSON.stringify({
          video_path: result.videoPath,
          videoPath: result.videoPath,
          videoSizeBytes: result.videoSizeBytes,
          durationSeconds: result.durationSeconds,
          slideshowMode: !!(options.sections && options.sections.length > 0),
          sectionCount: options.sections?.length ?? 0,
          message: '영상 생성 완료!',
        }),
        durationMs,
        logId,
      ]
    );

    console.log(`[Video] Background generation completed for content ${contentId} (${durationMs}ms)`);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : 'Unknown error';

    // Mark log as failed
    run(
      `UPDATE generation_logs SET status = 'failed', error_message = ?, duration_ms = ? WHERE id = ?`,
      [msg, durationMs, logId]
    );

    console.error(`[Video] Background generation failed for content ${contentId}: ${msg}`);
  }
}

// ─── POST /api/generate/video ───────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body: GenerateVideoRequest = await request.json();

    if (!body.content_id) {
      return Response.json(
        { success: false, error: 'content_id is required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const contentId = body.content_id;

    // Fetch content
    const content = queryOne<ContentRow>(
      'SELECT id, audio_path, subtitle_path, sections, status FROM contents WHERE id = ?',
      [contentId]
    );

    if (!content) {
      return Response.json(
        { success: false, error: 'Content not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    if (!content.audio_path) {
      return Response.json(
        { success: false, error: 'Content has no audio. Generate TTS first.' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Parse sections from content DB or request body
    let sections: Array<{ body: string; visual_prompt?: string; duration_seconds: number }> | undefined;

    if (body.sections && body.sections.length > 0) {
      sections = body.sections;
    } else if (content.sections) {
      try {
        const parsed: ScriptSection[] = JSON.parse(content.sections);
        if (Array.isArray(parsed) && parsed.length > 0) {
          sections = parsed.map((s) => ({
            body: s.body,
            visual_prompt: s.visual_prompt,
            duration_seconds: s.duration_seconds,
          }));
        }
      } catch {
        // sections parsing failed, will use legacy mode
      }
    }

    const generateImages = body.generate_images !== false; // default true
    const videoEngine: VideoEngine = body.video_engine || 'kling';

    // Create generation log with 'started' status
    const logResult = run(
      `INSERT INTO generation_logs (content_id, step, status, input_params, output_result) VALUES (?, 'video', 'started', ?, ?)`,
      [
        contentId,
        JSON.stringify({
          backgroundColor: body.background_color,
          backgroundImage: body.background_image,
          fontSize: body.font_size,
          sectionCount: sections?.length ?? 0,
          generateImages,
          videoEngine,
        }),
        JSON.stringify({
          current_section: 0,
          total_sections: sections?.length ?? 0,
          message: '영상 생성 대기 중...',
        }),
      ]
    );

    const logId = Number(logResult.lastInsertRowid);

    // Start background processing (fire-and-forget)
    processVideoGeneration(contentId, logId, content.audio_path, content.subtitle_path, {
      backgroundColor: body.background_color,
      backgroundImage: body.background_image,
      fontSize: body.font_size,
      sections,
      generateImages,
      videoEngine,
    }).catch((err) => {
      console.error(`[Video] Unhandled error in background processing:`, err);
    });

    // Return immediately with task info
    return Response.json({
      success: true,
      data: {
        task_id: logId,
        content_id: contentId,
        status: 'processing',
        message: '영상 생성이 시작되었습니다. 상태를 폴링하세요.',
      },
    } satisfies ApiResponse);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';

    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
