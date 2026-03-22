import { queryOne, run } from '@/lib/db';
import type {
  Content,
  UpdateContentRequest,
  ApiResponse,
} from '@/types';

// ─── Helper ─────────────────────────────────────────────────────────────────

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
  created_at: string;
  updated_at: string;
}

function rowToContent(row: ContentRow): Content {
  return {
    ...row,
    sections: row.sections ? JSON.parse(row.sections) : null,
    tags: row.tags ? JSON.parse(row.tags) : null,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  } as Content;
}

// ─── GET /api/contents/[id] ─────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [id]);

    if (!row) {
      return Response.json(
        { success: false, error: 'Content not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: rowToContent(row),
    } satisfies ApiResponse<Content>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// ─── PATCH /api/contents/[id] ───────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check existence
    const existing = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [id]);
    if (!existing) {
      return Response.json(
        { success: false, error: 'Content not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    const body: UpdateContentRequest = await request.json();

    // Build dynamic SET clause
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (body.title !== undefined) {
      setClauses.push('title = ?');
      values.push(body.title);
    }
    if (body.content_type !== undefined) {
      setClauses.push('content_type = ?');
      values.push(body.content_type);
    }
    if (body.status !== undefined) {
      setClauses.push('status = ?');
      values.push(body.status);
    }
    if (body.language !== undefined) {
      setClauses.push('language = ?');
      values.push(body.language);
    }
    if (body.script !== undefined) {
      setClauses.push('script = ?');
      values.push(body.script);
    }
    if (body.sections !== undefined) {
      setClauses.push('sections = ?');
      values.push(JSON.stringify(body.sections));
    }
    if (body.scheduled_date !== undefined) {
      setClauses.push('scheduled_date = ?');
      values.push(body.scheduled_date);
    }
    if (body.tags !== undefined) {
      setClauses.push('tags = ?');
      values.push(JSON.stringify(body.tags));
    }
    if (body.metadata !== undefined) {
      setClauses.push('metadata = ?');
      values.push(JSON.stringify(body.metadata));
    }

    if (setClauses.length === 0) {
      return Response.json(
        { success: false, error: 'No fields to update' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    values.push(id);
    run(
      `UPDATE contents SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const updated = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [id]);
    return Response.json({
      success: true,
      data: rowToContent(updated!),
    } satisfies ApiResponse<Content>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// ─── DELETE /api/contents/[id] ──────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = queryOne<ContentRow>('SELECT * FROM contents WHERE id = ?', [id]);
    if (!existing) {
      return Response.json(
        { success: false, error: 'Content not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    run('DELETE FROM contents WHERE id = ?', [id]);

    return Response.json({
      success: true,
      message: 'Content deleted',
    } satisfies ApiResponse);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
