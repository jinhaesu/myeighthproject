import { queryOne, run } from '@/lib/db';
import { generateScript, generateStoryboards, generateNarration } from '@/lib/claude';
import type {
  GenerateScriptRequest,
  ContentType,
  Language,
  VideoLength,
  ApiResponse,
  Storyboard,
  StoryboardCount,
} from '@/types';

interface ExtendedGenerateScriptRequest extends GenerateScriptRequest {
  visual_scenario?: string;
  series_info?: { name: string; episode: number; prefix: string };
}

interface ContentRow {
  id: number;
  title: string;
  content_type: ContentType;
  language: Language;
  video_length: number | null;
  ad_config: string | null;
  storyboards: string | null;
  storyboard_count: number | null;
}

export async function POST(request: Request) {
  const startTime = Date.now();
  let contentId: number | undefined;

  try {
    const body: ExtendedGenerateScriptRequest = await request.json();

    if (!body.content_id) {
      return Response.json(
        { success: false, error: 'content_id is required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    contentId = body.content_id;

    // Fetch content
    const content = queryOne<ContentRow>(
      'SELECT id, title, content_type, language, video_length, ad_config, storyboards, storyboard_count FROM contents WHERE id = ?',
      [contentId]
    );

    if (!content) {
      return Response.json(
        { success: false, error: 'Content not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    // Determine video length and ad config
    const videoLength = (body.video_length || content.video_length || 60) as VideoLength;
    const adConfig = body.ad_config || (content.ad_config ? JSON.parse(content.ad_config) : undefined);
    const mode = body.mode ?? 'full';

    // ── Mode: storyboard ────────────────────────────────────────────────────
    if (mode === 'storyboard') {
      if (!body.visual_scenario) {
        return Response.json(
          { success: false, error: 'visual_scenario is required for storyboard mode' } satisfies ApiResponse,
          { status: 400 }
        );
      }

      const storyboardCount = (body.storyboard_count ?? 8) as StoryboardCount;

      run(
        `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'script', 'started', ?)`,
        [contentId, JSON.stringify({ mode: 'storyboard', topic: body.topic || content.title, storyboardCount, videoLength })]
      );

      const sbResult = await generateStoryboards(
        content.content_type,
        body.topic || content.title,
        {
          visualScenario: body.visual_scenario,
          storyboardCount,
          videoLength,
          language: content.language,
          adConfig,
          seriesInfo: body.series_info,
        }
      );

      const durationMs = Date.now() - startTime;

      run(
        `UPDATE contents SET storyboards = ?, storyboard_count = ?, visual_scenario = ?, status = 'script_ready' WHERE id = ?`,
        [
          JSON.stringify(sbResult.storyboards),
          storyboardCount,
          body.visual_scenario,
          contentId,
        ]
      );

      run(
        `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms) VALUES (?, 'script', 'completed', ?, ?)`,
        [
          contentId,
          JSON.stringify({ mode: 'storyboard', boardCount: sbResult.storyboards.length }),
          durationMs,
        ]
      );

      return Response.json({
        success: true,
        data: {
          storyboards: sbResult.storyboards,
          storyboardCount,
          generationTimeMs: durationMs,
        },
      } satisfies ApiResponse);
    }

    // ── Mode: narration ─────────────────────────────────────────────────────
    if (mode === 'narration') {
      if (!content.storyboards) {
        return Response.json(
          { success: false, error: 'No storyboards found on this content. Run storyboard mode first.' } satisfies ApiResponse,
          { status: 400 }
        );
      }

      const existingStoryboards: Storyboard[] = JSON.parse(content.storyboards);

      run(
        `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'script', 'started', ?)`,
        [contentId, JSON.stringify({ mode: 'narration', topic: body.topic || content.title, boardCount: existingStoryboards.length })]
      );

      const narResult = await generateNarration(
        body.topic || content.title,
        existingStoryboards,
        {
          contentType: content.content_type,
          language: content.language,
          videoLength,
          adConfig,
        }
      );

      const durationMs = Date.now() - startTime;

      run(
        `UPDATE contents SET storyboards = ?, script = ?, hooks = ?, cta_options = ?, status = 'script_ready' WHERE id = ?`,
        [
          JSON.stringify(narResult.storyboardsWithScript),
          narResult.fullNarration,
          JSON.stringify(narResult.hooks),
          JSON.stringify(narResult.ctaOptions),
          contentId,
        ]
      );

      run(
        `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms) VALUES (?, 'script', 'completed', ?, ?)`,
        [
          contentId,
          JSON.stringify({ mode: 'narration', boardCount: narResult.storyboardsWithScript.length }),
          durationMs,
        ]
      );

      return Response.json({
        success: true,
        data: {
          storyboardsWithScript: narResult.storyboardsWithScript,
          hooks: narResult.hooks,
          ctaOptions: narResult.ctaOptions,
          fullNarration: narResult.fullNarration,
          generationTimeMs: durationMs,
        },
      } satisfies ApiResponse);
    }

    // ── Mode: full (default, existing behavior) ─────────────────────────────

    // Log start
    run(
      `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'script', 'started', ?)`,
      [contentId, JSON.stringify({ topic: body.topic || content.title, keywords: body.keywords, videoLength })]
    );

    // Generate script via Claude
    const result = await generateScript(
      content.content_type,
      body.topic || content.title,
      {
        language: content.language,
        keywords: body.keywords,
        additionalInstructions: body.additional_instructions,
        videoLength,
        adConfig,
        visual_scenario: body.visual_scenario,
        seriesInfo: body.series_info,
      }
    );

    const durationMs = Date.now() - startTime;

    // Update content with generated script
    run(
      `UPDATE contents SET script = ?, sections = ?, status = 'script_ready', tags = COALESCE(tags, ?), hooks = ?, cta_options = ?, visual_scenario = ? WHERE id = ?`,
      [
        result.fullScript,
        JSON.stringify(result.sections),
        JSON.stringify(result.tags),
        result.hooks ? JSON.stringify(result.hooks) : null,
        result.ctaOptions ? JSON.stringify(result.ctaOptions) : null,
        result.visualScenario ?? null,
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
          hasHooks: (result.hooks?.length || 0) > 0,
          hasCta: (result.ctaOptions?.length || 0) > 0,
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
        hooks: result.hooks,
        ctaOptions: result.ctaOptions,
        voiceoverScript: result.voiceoverScript,
        subtitles: result.subtitles,
        visualScenario: result.visualScenario,
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
