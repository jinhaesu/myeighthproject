import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PremiumTTSParams {
  text: string;
  voiceId?: string;
  modelId?: string;
  outputPath: string;
}

export interface PremiumTTSResult {
  audioPath: string;
  durationSec: number;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

// ElevenLabs Korean-friendly voices
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel (multilingual)
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';

// ─── Premium TTS Generation ────────────────────────────────────────────────

export async function generatePremiumTTS(params: PremiumTTSParams): Promise<PremiumTTSResult> {
  const {
    text,
    voiceId = DEFAULT_VOICE_ID,
    modelId = DEFAULT_MODEL_ID,
    outputPath,
  } = params;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ElevenLabs Text-to-Speech API
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`ElevenLabs API error (${response.status}): ${errorBody}`);
  }

  // Save audio file
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  // Estimate duration: ~150 words per minute for Korean, roughly 2.5 chars per word
  const charCount = text.length;
  const estimatedWords = charCount / 2.5;
  const durationSec = Math.max(1, Math.round((estimatedWords / 150) * 60));

  return {
    audioPath: outputPath,
    durationSec,
  };
}
