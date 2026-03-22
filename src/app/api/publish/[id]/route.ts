import { queryOne, run } from '@/lib/db';
import type {
  PublishJob,
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

// ─── PATCH /api/publish/[id] ───────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = queryOne<PublishJobRow>(
      'SELECT * FROM publish_jobs WHERE id = ?',
      [id]
    );
    if (!existing) {
      return Response.json(
        { success: false, error: 'Publish job not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    const body = await request.json();

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (body.status !== undefined) {
      setClauses.push('status = ?');
      values.push(body.status);

      if (body.status === 'published') {
        setClauses.push('published_at = datetime(\'now\')');
      }
    }
    if (body.post_url !== undefined) {
      setClauses.push('post_url = ?');
      values.push(body.post_url);
    }
    if (body.error_message !== undefined) {
      setClauses.push('error_message = ?');
      values.push(body.error_message);
    }
    if (body.retry_count !== undefined) {
      setClauses.push('retry_count = ?');
      values.push(body.retry_count);
    }
    if (body.caption !== undefined) {
      setClauses.push('caption = ?');
      values.push(body.caption);
    }

    if (setClauses.length === 0) {
      return Response.json(
        { success: false, error: 'No fields to update' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    values.push(id);
    run(
      `UPDATE publish_jobs SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const updated = queryOne<PublishJobRow>(
      JOIN_SQL + ' WHERE pj.id = ?',
      [id]
    );

    return Response.json({
      success: true,
      data: rowToJob(updated!),
    } satisfies ApiResponse<PublishJob>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// ─── DELETE /api/publish/[id] ──────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = queryOne<PublishJobRow>(
      'SELECT * FROM publish_jobs WHERE id = ?',
      [id]
    );
    if (!existing) {
      return Response.json(
        { success: false, error: 'Publish job not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    if (existing.status === 'published') {
      return Response.json(
        { success: false, error: 'Cannot cancel an already published job' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    run(
      `UPDATE publish_jobs SET status = 'cancelled' WHERE id = ?`,
      [id]
    );

    return Response.json({
      success: true,
      message: 'Publish job cancelled',
    } satisfies ApiResponse);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
