import path from 'path';
import { queryOne, run } from '@/lib/db';
import { generateKlingVideo } from '@/lib/kling';
import type { ApiResponse } from '@/types';

interface ContentRow {
  id: number;
  title: string;
  thumbnail_path: string | null;
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json() as {
      content_id?: number;
      prompt?: string;
      image_url?: string;
      duration?: '5' | '10';
      mode?: 'std' | 'pro';
    };

    const contentId = body.content_id;
    let prompt = body.prompt;
    let imageUrl = body.image_url;

    // If content_id is given, build prompt from content
    if (contentId) {
      const content = queryOne<ContentRow>(
        'SELECT id, title, thumbnail_path FROM contents WHERE id = ?',
        [contentId]
      );

      if (!content) {
        return Response.json(
          { success: false, error: 'Content not found' } satisfies ApiResponse,
          { status: 404 }
        );
      }

      if (!prompt) {
        prompt = `Smooth, cinematic motion for Korean health food content about: ${content.title}. Gentle camera movement, warm lighting, appetizing food visuals.`;
      }

      // Use thumbnail as image input if available
      if (!imageUrl && content.thumbnail_path) {
        imageUrl = content.thumbnail_path;
      }
    }

    if (!prompt) {
      return Response.json(
        { success: false, error: 'prompt or content_id is required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Log start
    if (contentId) {
      run(
        `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'kling', 'started', ?)`,
        [contentId, JSON.stringify({ prompt: prompt.slice(0, 200), duration: body.duration })]
      );
    }

    const projectRoot = process.cwd();
    const filename = contentId ? `ai_${contentId}.mp4` : `ai_${Date.now()}.mp4`;
    const outputPath = path.join(projectRoot, 'output', 'videos', filename);

    const result = await generateKlingVideo({
      prompt,
      imageUrl,
      duration: body.duration || '5',
      mode: body.mode,
      outputPath,
    });

    const durationMs = Date.now() - startTime;

    // Log completion
    if (contentId) {
      run(
        `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms) VALUES (?, 'kling', 'completed', ?, ?)`,
        [contentId, JSON.stringify({ videoPath: result.videoPath, taskId: result.taskId, durationSec: result.durationSec }), durationMs]
      );
    }

    return Response.json({
      success: true,
      data: {
        videoPath: result.videoPath,
        taskId: result.taskId,
        durationSec: result.durationSec,
        generationTimeMs: durationMs,
      },
    } satisfies ApiResponse);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : 'Unknown error';

    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
