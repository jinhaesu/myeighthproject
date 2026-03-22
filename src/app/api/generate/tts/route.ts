import { queryOne, run } from '@/lib/db';
import { generateTTS, speedToRate } from '@/lib/tts';
import type {
  GenerateTTSRequest,
  ApiResponse,
} from '@/types';

interface ContentRow {
  id: number;
  script: string | null;
  status: string;
}

export async function POST(request: Request) {
  const startTime = Date.now();
  let contentId: number | undefined;

  try {
    const body: GenerateTTSRequest = await request.json();

    if (!body.content_id) {
      return Response.json(
        { success: false, error: 'content_id is required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    contentId = body.content_id;

    // Fetch content
    const content = queryOne<ContentRow>(
      'SELECT id, script, status FROM contents WHERE id = ?',
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
        { success: false, error: 'Content has no script. Generate a script first.' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Log start
    run(
      `INSERT INTO generation_logs (content_id, step, status, input_params) VALUES (?, 'tts', 'started', ?)`,
      [contentId, JSON.stringify({ voice: body.voice, speed: body.speed })]
    );

    // Generate TTS
    const rate = body.speed ? speedToRate(body.speed) : undefined;
    const result = await generateTTS(content.script, contentId, {
      voice: body.voice,
      rate,
    });

    const durationMs = Date.now() - startTime;

    // Update content
    run(
      `UPDATE contents SET audio_path = ?, subtitle_path = ?, status = 'audio_ready' WHERE id = ?`,
      [result.audioPath, result.subtitlePath, contentId]
    );

    // Log completion
    run(
      `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms) VALUES (?, 'tts', 'completed', ?, ?)`,
      [
        contentId,
        JSON.stringify({
          audioPath: result.audioPath,
          subtitlePath: result.subtitlePath,
          audioSizeBytes: result.audioSizeBytes,
          voice: result.voice,
        }),
        durationMs,
      ]
    );

    return Response.json({
      success: true,
      data: {
        audioPath: result.audioPath,
        subtitlePath: result.subtitlePath,
        audioSizeBytes: result.audioSizeBytes,
        subtitleSizeBytes: result.subtitleSizeBytes,
        voice: result.voice,
        rate: result.rate,
        generationTimeMs: durationMs,
      },
    } satisfies ApiResponse);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : 'Unknown error';

    if (contentId) {
      run(
        `INSERT INTO generation_logs (content_id, step, status, error_message, duration_ms) VALUES (?, 'tts', 'failed', ?, ?)`,
        [contentId, msg, durationMs]
      );
    }

    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
