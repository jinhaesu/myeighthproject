import { queryOne, run } from '@/lib/db';
import type {
  PlanningTemplate,
  ApiResponse,
} from '@/types';

// ─── Helper: DB row shape ────────────────────────────────────────────────────

interface TemplateRow {
  id: number;
  name: string;
  description: string;
  content_type: string;
  video_length: number;
  language: string;
  ad_config: string | null;
  visual_scenario: string;
  tone_keywords: string | null;
  series_enabled: number;
  series_name: string | null;
  series_prefix: string | null;
  storyboard_count: number | null;
  storyboard_structure: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: TemplateRow): PlanningTemplate {
  return {
    ...row,
    video_length: row.video_length as PlanningTemplate['video_length'],
    language: row.language as PlanningTemplate['language'],
    content_type: row.content_type as PlanningTemplate['content_type'],
    ad_config: row.ad_config ? JSON.parse(row.ad_config) : null,
    tone_keywords: row.tone_keywords ? JSON.parse(row.tone_keywords) : [],
    series_enabled: row.series_enabled === 1,
    storyboard_count: (row.storyboard_count ?? 4) as PlanningTemplate['storyboard_count'],
    storyboard_structure: row.storyboard_structure ? JSON.parse(row.storyboard_structure) : null,
  };
}

// ─── GET /api/templates/[id] ─────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = queryOne<TemplateRow>(
      'SELECT * FROM planning_templates WHERE id = ?',
      [id]
    );

    if (!row) {
      return Response.json(
        { success: false, error: 'Template not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: rowToTemplate(row),
    } satisfies ApiResponse<PlanningTemplate>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// ─── PATCH /api/templates/[id] ───────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = queryOne<TemplateRow>(
      'SELECT * FROM planning_templates WHERE id = ?',
      [id]
    );
    if (!existing) {
      return Response.json(
        { success: false, error: 'Template not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    const body: Partial<{
      name: string;
      description: string;
      content_type: string;
      video_length: number;
      language: string;
      ad_config: unknown;
      visual_scenario: string;
      tone_keywords: string[];
      series_enabled: boolean;
      series_name: string | null;
      series_prefix: string | null;
    }> = await request.json();

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) {
      setClauses.push('name = ?');
      values.push(body.name);
    }
    if (body.description !== undefined) {
      setClauses.push('description = ?');
      values.push(body.description);
    }
    if (body.content_type !== undefined) {
      const validTypes = ['health_info', 'recipe', 'nutrition_tip', 'product_ad', 'brand_ad'];
      if (!validTypes.includes(body.content_type)) {
        return Response.json(
          { success: false, error: `content_type must be one of: ${validTypes.join(', ')}` } satisfies ApiResponse,
          { status: 400 }
        );
      }
      setClauses.push('content_type = ?');
      values.push(body.content_type);
    }
    if (body.video_length !== undefined) {
      const validLengths = [6, 15, 30, 60];
      if (!validLengths.includes(body.video_length)) {
        return Response.json(
          { success: false, error: `video_length must be one of: ${validLengths.join(', ')}` } satisfies ApiResponse,
          { status: 400 }
        );
      }
      setClauses.push('video_length = ?');
      values.push(body.video_length);
    }
    if (body.language !== undefined) {
      setClauses.push('language = ?');
      values.push(body.language);
    }
    if (body.ad_config !== undefined) {
      setClauses.push('ad_config = ?');
      values.push(body.ad_config !== null ? JSON.stringify(body.ad_config) : null);
    }
    if (body.visual_scenario !== undefined) {
      setClauses.push('visual_scenario = ?');
      values.push(body.visual_scenario);
    }
    if (body.tone_keywords !== undefined) {
      setClauses.push('tone_keywords = ?');
      values.push(JSON.stringify(body.tone_keywords));
    }
    if (body.series_enabled !== undefined) {
      setClauses.push('series_enabled = ?');
      values.push(body.series_enabled ? 1 : 0);
    }
    if (body.series_name !== undefined) {
      setClauses.push('series_name = ?');
      values.push(body.series_name);
    }
    if (body.series_prefix !== undefined) {
      setClauses.push('series_prefix = ?');
      values.push(body.series_prefix);
    }

    if (setClauses.length === 0) {
      return Response.json(
        { success: false, error: 'No fields to update' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Keep updated_at in sync (no trigger defined for planning_templates)
    setClauses.push("updated_at = datetime('now')");

    values.push(id);
    run(
      `UPDATE planning_templates SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const updated = queryOne<TemplateRow>(
      'SELECT * FROM planning_templates WHERE id = ?',
      [id]
    );
    return Response.json({
      success: true,
      data: rowToTemplate(updated!),
    } satisfies ApiResponse<PlanningTemplate>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// ─── DELETE /api/templates/[id] ──────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = queryOne<TemplateRow>(
      'SELECT * FROM planning_templates WHERE id = ?',
      [id]
    );
    if (!existing) {
      return Response.json(
        { success: false, error: 'Template not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    run('DELETE FROM planning_templates WHERE id = ?', [id]);

    return Response.json({
      success: true,
      message: 'Template deleted',
    } satisfies ApiResponse);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
