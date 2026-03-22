import path from 'path';
import { run } from '@/lib/db';
import { generateBGM } from '@/lib/mubert';
import type { ApiResponse } from '@/types';

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json() as {
      content_id?: number;
      prompt?: string;
      duration?: number;
    };

    const contentId = body.content_id;
    const prompt = body.prompt || 'calm healthy food cooking background music, gentle, warm, positive';
    const duration = body.duration || 60;

    // Log start
    if (contentId) {
      run(
        `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'bgm', 'started', ?)`,
        [contentId, JSON.stringify({ prompt, duration })]
      );
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const outBase = isProduction ? '/tmp' : process.cwd();
    const musicDir = path.join(outBase, 'output', 'music');
    const fs = await import('fs');
    if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
    const filename = contentId ? `${contentId}.mp3` : `${Date.now()}.mp3`;
    const outputPath = path.join(musicDir, filename);

    const result = await generateBGM({
      prompt,
      duration,
      outputPath,
    });

    const durationMs = Date.now() - startTime;

    // Log completion
    if (contentId) {
      run(
        `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms) VALUES (?, 'bgm', 'completed', ?, ?)`,
        [contentId, JSON.stringify({ bgmPath: result.bgmPath, durationSec: result.durationSec }), durationMs]
      );
    }

    return Response.json({
      success: true,
      data: {
        bgmPath: result.bgmPath,
        durationSec: result.durationSec,
        generationTimeMs: durationMs,
      },
    } satisfies ApiResponse);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : 'Unknown error';

    // Error logging - best effort
    try {
      const errorBody = await request.clone().json().catch(() => ({})) as { content_id?: number };
      if (errorBody.content_id) {
        run(
          `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'bgm', 'failed', ?, ?)`,
          [errorBody.content_id, msg, durationMs]
        );
      }
    } catch {
      // Ignore logging errors
    }

    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
