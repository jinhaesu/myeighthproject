import { type NextRequest } from 'next/server';
import { queryAll, queryOne, run, getDb } from '@/lib/db';
import type {
  PublishJob,
  CreatePublishJobRequest,
  ScheduleBulkPublishRequest,
  ApiResponse,
} from '@/types';

// ─── Row type ──────────────────────────────────────────────────────────────

interface PublishJobRow {
  id: number;
  content_id: number;
  platform_account_id: number;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  post_url: string | null;
  caption: string | null;
  hashtags: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  content_title?: string;
  platform?: string;
  account_name?: string;
}

function rowToJob(row: PublishJobRow): PublishJob {
  return {
    id: row.id,
    content_id: row.content_id,
    platform_account_id: row.platform_account_id,
    status: row.status as PublishJob['status'],
    scheduled_at: row.scheduled_at,
    published_at: row.published_at,
    post_url: row.post_url,
    caption: row.caption,
    hashtags: row.hashtags ? JSON.parse(row.hashtags) : null,
    error_message: row.error_message,
    retry_count: row.retry_count,
    created_at: row.created_at,
    content_title: row.content_title,
    platform: row.platform as PublishJob['platform'],
    account_name: row.account_name,
  };
}

const JOIN_SQL = `
  SELECT
    pj.*,
    c.title AS content_title,
    pa.platform AS platform,
    pa.account_name AS account_name
  FROM publish_jobs pj
  JOIN contents c ON c.id = pj.content_id
  JOIN platform_accounts pa ON pa.id = pj.platform_account_id
`;

// ─── GET /api/publish ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');
    const contentId = searchParams.get('content_id');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push('pj.status = ?');
      params.push(status);
    }
    if (platform) {
      conditions.push('pa.platform = ?');
      params.push(platform);
    }
    if (contentId) {
      conditions.push('pj.content_id = ?');
      params.push(contentId);
    }

    let sql = JOIN_SQL;
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY pj.scheduled_at DESC';

    const rows = queryAll<PublishJobRow>(sql, params);
    const data = rows.map(rowToJob);

    return Response.json({
      success: true,
      data,
    } satisfies ApiResponse<PublishJob[]>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// ─── POST /api/publish ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if it's a bulk request
    if ('platforms' in body && Array.isArray(body.platforms)) {
      return handleBulk(body as ScheduleBulkPublishRequest);
    }

    return handleSingle(body as CreatePublishJobRequest);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

async function handleSingle(body: CreatePublishJobRequest) {
  if (!body.content_id || !body.platform_account_id || !body.scheduled_at) {
    return Response.json(
      { success: false, error: 'content_id, platform_account_id, and scheduled_at are required' } satisfies ApiResponse,
      { status: 400 }
    );
  }

  const result = run(
    `INSERT INTO publish_jobs (content_id, platform_account_id, scheduled_at, caption, hashtags)
     VALUES (?, ?, ?, ?, ?)`,
    [
      body.content_id,
      body.platform_account_id,
      body.scheduled_at,
      body.caption || null,
      body.hashtags ? JSON.stringify(body.hashtags) : null,
    ]
  );

  const row = queryOne<PublishJobRow>(
    JOIN_SQL + ' WHERE pj.id = ?',
    [result.lastInsertRowid]
  );

  if (!row) {
    return Response.json(
      { success: false, error: 'Failed to create publish job' } satisfies ApiResponse,
      { status: 500 }
    );
  }

  return Response.json(
    { success: true, data: rowToJob(row) } satisfies ApiResponse<PublishJob>,
    { status: 201 }
  );
}

async function handleBulk(body: ScheduleBulkPublishRequest) {
  if (!body.content_id || !body.platforms || body.platforms.length === 0) {
    return Response.json(
      { success: false, error: 'content_id and at least one platform are required' } satisfies ApiResponse,
      { status: 400 }
    );
  }

  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO publish_jobs (content_id, platform_account_id, scheduled_at, caption)
     VALUES (?, ?, ?, ?)`
  );

  const insertMany = db.transaction(
    (items: ScheduleBulkPublishRequest['platforms']) => {
      const ids: number[] = [];
      for (const item of items) {
        const result = insert.run(
          body.content_id,
          item.platform_account_id,
          item.scheduled_at,
          item.caption || null
        );
        ids.push(Number(result.lastInsertRowid));
      }
      return ids;
    }
  );

  const ids = insertMany(body.platforms);

  const placeholders = ids.map(() => '?').join(',');
  const rows = queryAll<PublishJobRow>(
    JOIN_SQL + ` WHERE pj.id IN (${placeholders})`,
    ids
  );
  const data = rows.map(rowToJob);

  return Response.json(
    { success: true, data } satisfies ApiResponse<PublishJob[]>,
    { status: 201 }
  );
}
