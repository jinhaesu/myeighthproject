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

export async function POST(request: Request) {
  const startTime = Date.now();
  let contentId: number | undefined;

  try {
    const body: GenerateVideoRequest = await request.json();

    if (!body.content_id) {
      return Response.json(
        { success: false, error: 'content_id is required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    contentId = body.content_id;

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

    // Log start
    run(
      `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'video', 'started', ?)`,
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
      ]
    );

    // Generate video
    const result = await generateVideo(
      contentId,
      content.audio_path,
      content.subtitle_path,
      {
        backgroundColor: body.background_color,
        backgroundImage: body.background_image,
        fontSize: body.font_size,
        sections,
        generateImages,
        videoEngine,
      }
    );

    const durationMs = Date.now() - startTime;

    // Duration warning for short-form
    let durationWarning: string | undefined;
    if (result.durationSeconds > 60) {
      durationWarning = `Video duration (${Math.round(result.durationSeconds)}s) exceeds 60s short-form limit. Consider trimming the script.`;
    }

    // Update content
    run(
      `UPDATE contents SET video_path = ?, status = 'video_ready' WHERE id = ?`,
      [result.videoPath, contentId]
    );

    // Log completion
    run(
      `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms) VALUES (?, 'video', 'completed', ?, ?)`,
      [
        contentId,
        JSON.stringify({
          videoPath: result.videoPath,
          videoSizeBytes: result.videoSizeBytes,
          durationSeconds: result.durationSeconds,
          slideshowMode: !!sections,
          sectionCount: sections?.length ?? 0,
        }),
        durationMs,
      ]
    );

    return Response.json({
      success: true,
      data: {
        videoPath: result.videoPath,
        videoSizeBytes: result.videoSizeBytes,
        durationSeconds: result.durationSeconds,
        generationTimeMs: durationMs,
        slideshowMode: !!sections,
        ...(durationWarning && { durationWarning }),
      },
    } satisfies ApiResponse);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : 'Unknown error';

    if (contentId) {
      run(
        `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'video', 'failed', ?, ?)`,
        [contentId, msg, durationMs]
      );
    }

    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
