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

    const projectRoot = process.cwd();
    const filename = contentId ? `${contentId}.mp3` : `${Date.now()}.mp3`;
    const outputPath = path.join(projectRoot, 'output', 'music', filename);

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

    const contentId = (await request.clone().json().catch(() => ({}))).content_id;
    if (contentId) {
      try {
        run(
          `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'bgm', 'failed', ?, ?)`,
          [contentId, msg, durationMs]
        );
      } catch {
        // Ignore logging errors
      }
    }

    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
