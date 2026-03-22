import type {
  BulkPipelineRequest,
  PipelineResult,
  ApiResponse,
} from '@/types';

// ─── POST /api/pipeline/bulk ────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body: BulkPipelineRequest = await request.json();

    // Validate
    if (!body.items || body.items.length === 0) {
      return Response.json(
        { success: false, error: 'items array is required and must not be empty' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    if (body.items.length > 30) {
      return Response.json(
        { success: false, error: 'Maximum 30 items per bulk request' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const language = body.language || 'ko';
    const platforms = body.platforms || [];
    const results: PipelineResult[] = [];
    const errors: Array<{ index: number; topic: string; error: string }> = [];

    // Calculate schedule dates if auto_schedule is enabled
    const scheduleDates: string[] = [];
    if (body.auto_schedule && body.start_date && body.post_time) {
      const startDate = new Date(body.start_date + 'T' + body.post_time + ':00');
      for (let i = 0; i < body.items.length; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        scheduleDates.push(date.toISOString());
      }
    }

    // Process each item sequentially (to avoid overwhelming resources)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i];

      try {
        const pipelineBody = {
          content_type: item.content_type,
          topic: item.topic,
          language,
          platforms,
          scheduled_at: scheduleDates[i] || undefined,
          auto_caption: true,
        };

        const res = await fetch(`${baseUrl}/api/pipeline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pipelineBody),
        });

        const json: ApiResponse<PipelineResult> = await res.json();

        if (json.success && json.data) {
          results.push(json.data);
        } else {
          errors.push({
            index: i,
            topic: item.topic,
            error: json.error || 'Unknown pipeline error',
          });
        }
      } catch (err) {
        errors.push({
          index: i,
          topic: item.topic,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return Response.json({
      success: true,
      data: {
        total: body.items.length,
        completed: results.length,
        failed: errors.length,
        results,
        errors,
      },
    } satisfies ApiResponse, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
