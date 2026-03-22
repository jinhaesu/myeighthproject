import { queryOne, run } from '@/lib/db';
import { generateVideo } from '@/lib/video';
import type {
  GenerateVideoRequest,
  ApiResponse,
} from '@/types';

interface ContentRow {
  id: number;
  audio_path: string | null;
  subtitle_path: string | null;
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
      'SELECT id, audio_path, subtitle_path, status FROM contents WHERE id = ?',
      [contentId]
    );

    if (!content) {
      return Response.json(
        { success: false, error: 'Content not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    if (!content.audio_path || !content.subtitle_path) {
      return Response.json(
        { success: false, error: 'Content has no audio/subtitles. Generate TTS first.' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Log start
    run(
      `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'video', 'started', ?)`,
      [
        contentId,
        JSON.stringify({
          backgroundColor: body.background_color,
          backgroundImage: body.background_image,
          fontSize: body.font_size,
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
      }
    );

    const durationMs = Date.now() - startTime;

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
