import path from 'path';
import fs from 'fs';
import { queryOne, run } from '@/lib/db';
import { generateTTS, speedToRate } from '@/lib/tts';
import { generatePremiumTTS } from '@/lib/elevenlabs';
import type {
  ApiResponse,
} from '@/types';

interface ContentRow {
  id: number;
  script: string | null;
  status: string;
}

interface TTSRequestBody {
  content_id: number;
  voice?: string;
  speed?: number;
  tts_provider?: 'elevenlabs' | 'edge-tts';
}

export async function POST(request: Request) {
  const startTime = Date.now();
  let contentId: number | undefined;

  try {
    const body: TTSRequestBody = await request.json();

    if (!body.content_id) {
      return Response.json(
        { success: false, error: 'content_id is required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    contentId = body.content_id;
    const provider = body.tts_provider || 'edge-tts';

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
      [contentId, JSON.stringify({ voice: body.voice, speed: body.speed, provider })]
    );

    let audioPath: string;
    let subtitlePath: string;
    let audioSizeBytes: number;
    let subtitleSizeBytes = 0;
    let voiceUsed: string;
    let rateUsed: string = '+0%';

    if (provider === 'elevenlabs') {
      // Try ElevenLabs, fall back to edge-tts on failure
      try {
        const projectRoot = process.cwd();
        const premiumAudioPath = path.join(projectRoot, 'output', 'audio', `${contentId}.mp3`);

        const premiumResult = await generatePremiumTTS({
          text: content.script,
          voiceId: body.voice,
          outputPath: premiumAudioPath,
        });

        audioPath = premiumResult.audioPath;
        audioSizeBytes = fs.statSync(audioPath).size;
        voiceUsed = body.voice || 'elevenlabs-default';

        // ElevenLabs doesn't produce subtitles, create empty VTT
        subtitlePath = path.join(projectRoot, 'output', 'subtitles', `${contentId}.vtt`);
        const subtitleDir = path.dirname(subtitlePath);
        if (!fs.existsSync(subtitleDir)) fs.mkdirSync(subtitleDir, { recursive: true });
        fs.writeFileSync(subtitlePath, 'WEBVTT\n\n');
        subtitleSizeBytes = fs.statSync(subtitlePath).size;
      } catch (elevenLabsErr) {
        console.warn('[TTS] ElevenLabs failed, falling back to edge-tts:', elevenLabsErr);
        const rate = body.speed ? speedToRate(body.speed) : undefined;
        const result = await generateTTS(content.script, contentId, {
          voice: body.voice,
          rate,
        });
        audioPath = result.audioPath;
        subtitlePath = result.subtitlePath;
        audioSizeBytes = result.audioSizeBytes;
        subtitleSizeBytes = result.subtitleSizeBytes;
        voiceUsed = result.voice;
        rateUsed = result.rate;
      }
    } else {
      // Use edge-tts
      const rate = body.speed ? speedToRate(body.speed) : undefined;
      const result = await generateTTS(content.script, contentId, {
        voice: body.voice,
        rate,
      });
      audioPath = result.audioPath;
      subtitlePath = result.subtitlePath;
      audioSizeBytes = result.audioSizeBytes;
      subtitleSizeBytes = result.subtitleSizeBytes;
      voiceUsed = result.voice;
      rateUsed = result.rate;
    }

    const durationMs = Date.now() - startTime;

    // Update content
    run(
      `UPDATE contents SET audio_path = ?, subtitle_path = ?, status = 'audio_ready' WHERE id = ?`,
      [audioPath, subtitlePath, contentId]
    );

    // Log completion
    run(
      `INSERT INTO generation_logs (content_id, step, status, output_result, duration_ms) VALUES (?, 'tts', 'completed', ?, ?)`,
      [
        contentId,
        JSON.stringify({
          audioPath,
          subtitlePath,
          audioSizeBytes,
          voice: voiceUsed,
          provider,
        }),
        durationMs,
      ]
    );

    return Response.json({
      success: true,
      data: {
        audioPath,
        subtitlePath,
        audioSizeBytes,
        subtitleSizeBytes,
        voice: voiceUsed,
        rate: rateUsed,
        provider,
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
