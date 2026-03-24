import { type NextRequest } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import type {
  PlanningTemplate,
  CreateTemplateRequest,
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
  };
}

// ─── GET /api/templates ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const contentType = searchParams.get('content_type');

    let where = '';
    const params: unknown[] = [];

    if (contentType) {
      where = 'WHERE content_type = ?';
      params.push(contentType);
    }

    const rows = queryAll<TemplateRow>(
      `SELECT * FROM planning_templates ${where} ORDER BY created_at DESC`,
      params
    );

    return Response.json({
      success: true,
      data: rows.map(rowToTemplate),
    } satisfies ApiResponse<PlanningTemplate[]>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// ─── POST /api/templates ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: CreateTemplateRequest = await request.json();

    if (!body.name || !body.content_type || !body.video_length) {
      return Response.json(
        { success: false, error: 'name, content_type, and video_length are required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const validTypes = ['health_info', 'recipe', 'nutrition_tip', 'product_ad', 'brand_ad'];
    if (!validTypes.includes(body.content_type)) {
      return Response.json(
        { success: false, error: `content_type must be one of: ${validTypes.join(', ')}` } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const validLengths = [6, 15, 30, 60];
    if (!validLengths.includes(body.video_length)) {
      return Response.json(
        { success: false, error: `video_length must be one of: ${validLengths.join(', ')}` } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const result = run(
      `INSERT INTO planning_templates
         (name, description, content_type, video_length, language, ad_config,
          visual_scenario, tone_keywords, series_enabled, series_name, series_prefix)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.description ?? '',
        body.content_type,
        body.video_length,
        body.language ?? 'ko',
        body.ad_config ? JSON.stringify(body.ad_config) : null,
        body.visual_scenario ?? '',
        body.tone_keywords ? JSON.stringify(body.tone_keywords) : null,
        body.series_enabled ? 1 : 0,
        body.series_name ?? null,
        body.series_prefix ?? null,
      ]
    );

    const row = queryOne<TemplateRow>(
      'SELECT * FROM planning_templates WHERE id = ?',
      [result.lastInsertRowid]
    );

    if (!row) {
      return Response.json(
        { success: false, error: 'Failed to create template' } satisfies ApiResponse,
        { status: 500 }
      );
    }

    return Response.json(
      { success: true, data: rowToTemplate(row) } satisfies ApiResponse<PlanningTemplate>,
      { status: 201 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
