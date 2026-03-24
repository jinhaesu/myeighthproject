import { queryOne } from '@/lib/db';
import type { ApiResponse } from '@/types';

interface GenerationLogRow {
  id: number;
  content_id: number;
  status: string;
  output_result: string | null;
  error_message: string | null;
  duration_ms: number | null;
}

// ─── GET /api/generate/heygen/status?content_id=X ───────────────────────────

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const contentIdStr = url.searchParams.get('content_id');

    if (!contentIdStr) {
      return Response.json(
        { success: false, error: 'content_id query parameter is required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const contentId = parseInt(contentIdStr, 10);
    if (isNaN(contentId)) {
      return Response.json(
        { success: false, error: 'content_id must be a number' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Get the latest heygen generation log for this content
    const log = queryOne<GenerationLogRow>(
      `SELECT id, content_id, status, output_result, error_message, duration_ms
       FROM generation_logs
       WHERE content_id = ? AND step = 'heygen'
       ORDER BY id DESC LIMIT 1`,
      [contentId]
    );

    if (!log) {
      return Response.json(
        { success: false, error: 'No HeyGen generation task found for this content' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    // Parse progress info from output_result
    let progress: string | null = null;
    let videoPath: string | null = null;

    if (log.output_result) {
      try {
        const result = JSON.parse(log.output_result);
        progress = result.message || null;
        videoPath = result.video_path || result.videoPath || null;
      } catch {
        // ignore parse errors
      }
    }

    // Map DB status to API status
    let status: 'processing' | 'completed' | 'failed';
    if (log.status === 'started') {
      status = 'processing';
    } else if (log.status === 'completed') {
      status = 'completed';
    } else {
      status = 'failed';
    }

    return Response.json({
      success: true,
      data: {
        task_id: log.id,
        status,
        progress,
        video_path: videoPath,
        error: log.error_message,
        duration_ms: log.duration_ms,
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
