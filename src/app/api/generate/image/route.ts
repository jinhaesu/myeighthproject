import path from 'path';
import { queryOne, run } from '@/lib/db';
import { generateImage } from '@/lib/image';
import type { ApiResponse } from '@/types';

interface ContentRow {
  id: number;
  title: string;
  script: string | null;
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json() as {
      content_id?: number;
      prompt?: string;
      style?: 'natural' | 'vivid';
      size?: '1024x1024' | '1024x1792' | '1792x1024';
    };

    const contentId = body.content_id;
    let prompt = body.prompt;

    // If content_id is given, generate prompt from script
    if (contentId && !prompt) {
      const content = queryOne<ContentRow>(
        'SELECT id, title, script FROM contents WHERE id = ?',
        [contentId]
      );

      if (!content) {
        return Response.json(
          { success: false, error: 'Content not found' } satisfies ApiResponse,
          { status: 404 }
        );
      }

      prompt = `Korean health food brand "Nuldam" thumbnail image for topic: ${content.title}. Clean, modern, professional food photography style. High quality, appetizing, warm lighting.`;
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
        `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'image', 'started', ?)`,
        [contentId, JSON.stringify({ prompt: prompt.slice(0, 200), style: body.style, size: body.size })]
      );
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const baseDir = isProduction ? '/tmp' : process.cwd();
    const sectionIdx = (body as Record<string, unknown>).section_index;
    const filename = contentId
      ? (sectionIdx != null ? `${contentId}_section${sectionIdx}.png` : `${contentId}.png`)
      : `${Date.now()}.png`;
    const outputPath = path.join(baseDir, 'output', 'images', filename);

    const result = await generateImage({
      prompt,
      style: body.style,
      size: body.size,
      outputPath,
    });

    const durationMs = Date.now() - startTime;

    // Update content thumbnail_path if content_id provided
    if (contentId) {
      run(
        `UPDATE contents SET thumbnail_path = ? WHERE id = ?`,
        [result.imagePath, contentId]
      );

      run(
        `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms) VALUES (?, 'image', 'completed', ?, ?)`,
        [contentId, JSON.stringify({ imagePath: result.imagePath, revisedPrompt: result.revisedPrompt }), durationMs]
      );
    }

    // Build a browser-accessible absolute URL for the generated image
    // In production, frontend is on Vercel but files are on Railway
    const relMatch = result.imagePath.match(/output[/\\](.+)$/);
    const relativePath = relMatch
      ? relMatch[1].replace(/\\/g, '/')
      : `images/${filename}`;
    const railwayHost = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : (isProduction ? 'https://myeighthproject-production.up.railway.app' : '');
    const browsableUrl = `${railwayHost}/api/files/${relativePath}`;

    return Response.json({
      success: true,
      data: {
        imagePath: result.imagePath,
        imageUrl: browsableUrl,
        originalUrl: result.originalUrl,  // Original DALL-E CDN URL for external APIs (e.g. Kling)
        revisedPrompt: result.revisedPrompt,
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
