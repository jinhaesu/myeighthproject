import { type NextRequest } from 'next/server';
import { queryAll, run } from '@/lib/db';
import type {
  CalendarEvent,
  CreateCalendarEventRequest,
  ApiResponse,
} from '@/types';

// ─── GET /api/calendar ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    let sql = 'SELECT * FROM calendar_events';
    const params: unknown[] = [];

    // Filter by year-month if provided
    if (year && month) {
      const monthStr = month.padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      // Calculate end of month
      const nextMonth = parseInt(month, 10) + 1;
      const endYear = nextMonth > 12 ? parseInt(year, 10) + 1 : parseInt(year, 10);
      const endMonth = nextMonth > 12 ? 1 : nextMonth;
      const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

      sql += ' WHERE event_date >= ? AND event_date < ?';
      params.push(startDate, endDate);
    }

    sql += ' ORDER BY event_date ASC';

    const rows = queryAll<CalendarEvent>(sql, params);

    return Response.json({
      success: true,
      data: rows,
    } satisfies ApiResponse<CalendarEvent[]>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// ─── POST /api/calendar ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: CreateCalendarEventRequest = await request.json();

    if (!body.title || !body.event_date || !body.event_type) {
      return Response.json(
        { success: false, error: 'title, event_date, and event_type are required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const validTypes = ['health_info', 'recipe', 'nutrition_tip'];
    if (!validTypes.includes(body.event_type)) {
      return Response.json(
        { success: false, error: `event_type must be one of: ${validTypes.join(', ')}` } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const result = run(
      `INSERT INTO calendar_events (content_id, title, description, event_date, event_type)
       VALUES (?, ?, ?, ?, ?)`,
      [
        body.content_id || null,
        body.title,
        body.description || null,
        body.event_date,
        body.event_type,
      ]
    );

    const created = queryAll<CalendarEvent>(
      'SELECT * FROM calendar_events WHERE id = ?',
      [result.lastInsertRowid]
    );

    return Response.json(
      {
        success: true,
        data: created[0],
      } satisfies ApiResponse<CalendarEvent>,
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
