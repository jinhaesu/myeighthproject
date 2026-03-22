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

// ─── GET /api/pipeline/status?content_id=X ──────────────────────────────────

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

    // Get the latest pipeline generation log for this content
    const log = queryOne<GenerationLogRow>(
      `SELECT id, content_id, status, output_result, error_message, duration_ms
       FROM generation_logs
       WHERE content_id = ? AND step = 'pipeline'
       ORDER BY id DESC LIMIT 1`,
      [contentId]
    );

    if (!log) {
      return Response.json(
        { success: false, error: 'No pipeline task found for this content' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    // Parse progress info from output_result
    let progress: string | null = null;
    let currentStep: string | null = null;
    let stepsCompleted: number | null = null;
    let pipelineResult: Record<string, unknown> | null = null;

    if (log.output_result) {
      try {
        const result = JSON.parse(log.output_result);
        progress = result.message || null;
        currentStep = result.current_step || null;
        stepsCompleted = result.steps_completed ?? null;

        // If completed, include full pipeline result
        if (log.status === 'completed') {
          pipelineResult = {
            content_id: result.content_id,
            steps: result.steps,
            publish_job_ids: result.publish_job_ids,
            total_duration_ms: result.total_duration_ms,
          };
        }
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
        content_id: contentId,
        status,
        progress,
        current_step: currentStep,
        steps_completed: stepsCompleted,
        result: pipelineResult,
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
