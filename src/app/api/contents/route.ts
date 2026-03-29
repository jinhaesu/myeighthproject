import { type NextRequest } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import type {
  Content,
  CreateContentRequest,
  ApiResponse,
} from '@/types';

// ─── Helper: parse JSON columns ────────────────────────────────────────────

interface ContentRow {
  id: number;
  title: string;
  content_type: string;
  status: string;
  language: string;
  script: string | null;
  sections: string | null;
  audio_path: string | null;
  subtitle_path: string | null;
  video_path: string | null;
  thumbnail_path: string | null;
  scheduled_date: string | null;
  tags: string | null;
  metadata: string | null;
  video_length: number | null;
  ad_config: string | null;
  hooks: string | null;
  cta_options: string | null;
  template_id: number | null;
  series_episode: number | null;
  visual_scenario: string | null;
  storyboard_count: number | null;
  storyboards: string | null;
  created_at: string;
  updated_at: string;
}

function rowToContent(row: ContentRow): Content {
  return {
    ...row,
    sections: row.sections ? JSON.parse(row.sections) : null,
    tags: row.tags ? JSON.parse(row.tags) : null,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    ad_config: row.ad_config ? JSON.parse(row.ad_config) : null,
    hooks: row.hooks ? JSON.parse(row.hooks) : null,
    cta_options: row.cta_options ? JSON.parse(row.cta_options) : null,
    storyboard_count: row.storyboard_count as Content['storyboard_count'] ?? null,
    storyboards: row.storyboards ? JSON.parse(row.storyboards) : null,
  } as Content;
}

// ─── GET /api/contents ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;
    const status = searchParams.get('status');
    const contentType = searchParams.get('content_type');

    let where = '';
    const params: unknown[] = [];

    const conditions: string[] = [];
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (contentType) {
      conditions.push('content_type = ?');
      params.push(contentType);
    }
    if (conditions.length > 0) {
      where = 'WHERE ' + conditions.join(' AND ');
    }

    const countRow = queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM contents ${where}`,
      params
    );
    const total = countRow?.cnt ?? 0;

    const rows = queryAll<ContentRow>(
      `SELECT * FROM contents ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(rowToContent);

    return Response.json({
      success: true,
      data,
      total,
      page,
      limit,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// ─── POST /api/contents ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: CreateContentRequest = await request.json();

    if (!body.title || !body.content_type) {
      return Response.json(
        { success: false, error: 'title and content_type are required' } satisfies ApiResponse,
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

    const extBody = body as CreateContentRequest & {
      template_id?: number;
      series_episode?: number;
      visual_scenario?: string;
    };

    const result = run(
      `INSERT INTO contents
         (title, content_type, language, scheduled_date, tags, video_length, ad_config,
          template_id, series_episode, visual_scenario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        extBody.title,
        extBody.content_type,
        extBody.language || 'ko',
        extBody.scheduled_date || null,
        extBody.tags ? JSON.stringify(extBody.tags) : null,
        extBody.video_length || null,
        extBody.ad_config ? JSON.stringify(extBody.ad_config) : null,
        extBody.template_id ?? null,
        extBody.series_episode ?? null,
        extBody.visual_scenario ?? null,
      ]
    );

    const row = queryOne<ContentRow>(
      'SELECT * FROM contents WHERE id = ?',
      [result.lastInsertRowid]
    );

    if (!row) {
      return Response.json(
        { success: false, error: 'Failed to create content' } satisfies ApiResponse,
        { status: 500 }
      );
    }

    return Response.json(
      { success: true, data: rowToContent(row) } satisfies ApiResponse<Content>,
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
