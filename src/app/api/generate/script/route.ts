import { queryOne, run } from '@/lib/db';
import { generateScript } from '@/lib/claude';
import type {
  GenerateScriptRequest,
  ContentType,
  Language,
  ApiResponse,
} from '@/types';

interface ContentRow {
  id: number;
  title: string;
  content_type: ContentType;
  language: Language;
}

export async function POST(request: Request) {
  const startTime = Date.now();
  let contentId: number | undefined;

  try {
    const body: GenerateScriptRequest = await request.json();

    if (!body.content_id) {
      return Response.json(
        { success: false, error: 'content_id is required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    contentId = body.content_id;

    // Fetch content
    const content = queryOne<ContentRow>(
      'SELECT id, title, content_type, language FROM contents WHERE id = ?',
      [contentId]
    );

    if (!content) {
      return Response.json(
        { success: false, error: 'Content not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    // Log start
    run(
      `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'script', 'started', ?)`,
      [contentId, JSON.stringify({ topic: body.topic || content.title, keywords: body.keywords })]
    );

    // Generate script via Claude
    const result = await generateScript(
      content.content_type,
      body.topic || content.title,
      {
        language: content.language,
        keywords: body.keywords,
        additionalInstructions: body.additional_instructions,
      }
    );

    const durationMs = Date.now() - startTime;

    // Update content with generated script
    run(
      `UPDATE contents SET script = ?, sections = ?, status = 'script_ready', tags = COALESCE(tags, ?) WHERE id = ?`,
      [
        result.fullScript,
        JSON.stringify(result.sections),
        JSON.stringify(result.tags),
        contentId,
      ]
    );

    // Log completion
    run(
      `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms) VALUES (?, 'script', 'completed', ?, ?)`,
      [
        contentId,
        JSON.stringify({
          title: result.title,
          sectionCount: result.sections.length,
          totalDuration: result.totalDuration,
        }),
        durationMs,
      ]
    );

    return Response.json({
      success: true,
      data: {
        title: result.title,
        sections: result.sections,
        fullScript: result.fullScript,
        tags: result.tags,
        totalDuration: result.totalDuration,
        generationTimeMs: durationMs,
      },
    } satisfies ApiResponse);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : 'Unknown error';

    // Log failure
    if (contentId) {
      run(
        `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'script', 'failed', ?, ?)`,
        [contentId, msg, durationMs]
      );
    }

    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
