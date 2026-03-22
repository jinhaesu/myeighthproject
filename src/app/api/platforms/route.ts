import { type NextRequest } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import type {
  PlatformAccount,
  CreatePlatformAccountRequest,
  ApiResponse,
} from '@/types';

// ─── Row type ──────────────────────────────────────────────────────────────

interface PlatformAccountRow {
  id: number;
  platform: string;
  account_name: string;
  handle: string | null;
  credentials: string | null;
  is_active: number;
  created_at: string;
}

function rowToAccount(row: PlatformAccountRow): PlatformAccount {
  return {
    id: row.id,
    platform: row.platform as PlatformAccount['platform'],
    account_name: row.account_name,
    handle: row.handle,
    is_active: row.is_active === 1,
    created_at: row.created_at,
  };
}

// ─── GET /api/platforms ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const platform = searchParams.get('platform');

    let sql = 'SELECT * FROM platform_accounts';
    const params: unknown[] = [];

    if (platform) {
      sql += ' WHERE platform = ?';
      params.push(platform);
    }

    sql += ' ORDER BY created_at DESC';

    const rows = queryAll<PlatformAccountRow>(sql, params);
    const data = rows.map(rowToAccount);

    return Response.json({
      success: true,
      data,
    } satisfies ApiResponse<PlatformAccount[]>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// ─── POST /api/platforms ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: CreatePlatformAccountRequest = await request.json();

    if (!body.platform || !body.account_name) {
      return Response.json(
        { success: false, error: 'platform and account_name are required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const validPlatforms = ['instagram', 'youtube', 'tiktok', 'facebook'];
    if (!validPlatforms.includes(body.platform)) {
      return Response.json(
        { success: false, error: `platform must be one of: ${validPlatforms.join(', ')}` } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const result = run(
      `INSERT INTO platform_accounts (platform, account_name, handle)
       VALUES (?, ?, ?)`,
      [body.platform, body.account_name, body.handle || null]
    );

    const row = queryOne<PlatformAccountRow>(
      'SELECT * FROM platform_accounts WHERE id = ?',
      [result.lastInsertRowid]
    );

    if (!row) {
      return Response.json(
        { success: false, error: 'Failed to create platform account' } satisfies ApiResponse,
        { status: 500 }
      );
    }

    return Response.json(
      { success: true, data: rowToAccount(row) } satisfies ApiResponse<PlatformAccount>,
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
