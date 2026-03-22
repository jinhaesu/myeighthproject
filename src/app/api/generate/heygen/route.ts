import path from 'path';
import { queryOne, run } from '@/lib/db';
import { generateHeyGenVideo } from '@/lib/heygen';
import type { ApiResponse, ScriptSection } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContentRow {
  id: number;
  script: string | null;
  sections: string | null;
  status: string;
  language: string;
  thumbnail_path: string | null;
}

interface HeyGenRequest {
  content_id: number;
  avatar_style?: 'professional' | 'casual' | 'narrator';
  avatar_id?: string;
  voice_id?: string;
}

// ─── Avatar Style Mapping ───────────────────────────────────────────────────

const AVATAR_STYLE_MAP: Record<string, string> = {
  professional: 'Abigail_expressive_2024112501',
  casual: 'Abigail_expressive_2024112501',
  narrator: 'Abigail_expressive_2024112501',
};

// ─── POST /api/generate/heygen ──────────────────────────────────────────────

export async function POST(request: Request) {
  const startTime = Date.now();
  let contentId: number | undefined;

  try {
    const body: HeyGenRequest = await request.json();

    if (!body.content_id) {
      return Response.json(
        { success: false, error: 'content_id is required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    contentId = body.content_id;

    // Check HeyGen API key
    if (!process.env.HEYGEN_API_KEY) {
      return Response.json(
        { success: false, error: 'HEYGEN_API_KEY is not configured' } satisfies ApiResponse,
        { status: 500 }
      );
    }

    // Fetch content
    const content = queryOne<ContentRow>(
      'SELECT id, script, sections, status, language, thumbnail_path FROM contents WHERE id = ?',
      [contentId]
    );

    if (!content) {
      return Response.json(
        { success: false, error: 'Content not found' } satisfies ApiResponse,
        { status: 404 }
      );
    }

    if (!content.script) {
      return Response.json(
        { success: false, error: 'Content has no script. Generate script first.' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Build the full script text from sections or use raw script
    let scriptText = content.script;

    if (content.sections) {
      try {
        const sections: ScriptSection[] = JSON.parse(content.sections);
        if (Array.isArray(sections) && sections.length > 0) {
          // Combine all section bodies into a single script
          scriptText = sections.map((s) => s.body).join('\n\n');
        }
      } catch {
        // Use raw script as fallback
      }
    }

    // Determine avatar ID
    const avatarId = body.avatar_id
      || (body.avatar_style ? AVATAR_STYLE_MAP[body.avatar_style] : undefined);

    // Determine output path
    const isProduction = process.env.NODE_ENV === 'production';
    const outBase = isProduction ? '/tmp' : process.cwd();
    const videoPath = path.join(outBase, 'output', 'videos', `${contentId}_heygen.mp4`);

    // Log start
    run(
      `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'heygen', 'started', ?)`,
      [
        contentId,
        JSON.stringify({
          avatarStyle: body.avatar_style || 'default',
          avatarId: avatarId || 'default',
          language: content.language,
          scriptLength: scriptText.length,
        }),
      ]
    );

    // Generate HeyGen avatar video
    const result = await generateHeyGenVideo({
      script: scriptText,
      avatarId,
      voiceId: body.voice_id,
      language: (content.language as 'ko' | 'en') || 'ko',
      outputPath: videoPath,
    });

    const durationMs = Date.now() - startTime;

    // Update content status
    run(
      `UPDATE contents SET video_path = ?, status = 'video_ready' WHERE id = ?`,
      [result.videoPath, contentId]
    );

    // Log completion
    run(
      `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms) VALUES (?, 'heygen', 'completed', ?, ?)`,
      [
        contentId,
        JSON.stringify({
          videoPath: result.videoPath,
          videoId: result.videoId,
          durationSec: result.durationSec,
        }),
        durationMs,
      ]
    );

    return Response.json({
      success: true,
      data: {
        videoPath: result.videoPath,
        videoId: result.videoId,
        durationSec: result.durationSec,
        generationTimeMs: durationMs,
      },
    } satisfies ApiResponse);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : 'Unknown error';

    if (contentId) {
      run(
        `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'heygen', 'failed', ?, ?)`,
        [contentId, msg, durationMs]
      );
    }

    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
