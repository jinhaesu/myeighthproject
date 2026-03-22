import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TTSOptions {
  voice?: string;
  rate?: string;
}

export interface TTSResult {
  audioPath: string;
  subtitlePath: string;
  audioSizeBytes: number;
  subtitleSizeBytes: number;
  voice: string;
  rate: string;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_VOICE = 'ko-KR-SunHiNeural';
const DEFAULT_RATE = '+0%';

// ─── TTS Generation ────────────────────────────────────────────────────────

export async function generateTTS(
  text: string,
  contentId: number,
  options: TTSOptions = {}
): Promise<TTSResult> {
  const { voice = DEFAULT_VOICE, rate = DEFAULT_RATE } = options;

  const projectRoot = process.cwd();
  const scriptCandidates = [
    path.join(projectRoot, 'scripts', 'tts_generate.py'),
    '/app/scripts/tts_generate.py',
  ];
  const scriptPath = scriptCandidates.find(p => require('fs').existsSync(p)) || scriptCandidates[0];

  const isProduction = process.env.NODE_ENV === 'production';
  const outBase = isProduction ? '/tmp' : projectRoot;
  const audioDir = path.join(outBase, 'output', 'audio');
  const subDir = path.join(outBase, 'output', 'subtitles');
  require('fs').mkdirSync(audioDir, { recursive: true });
  require('fs').mkdirSync(subDir, { recursive: true });
  const audioPath = path.join(audioDir, `${contentId}.mp3`);
  const subtitlePath = path.join(subDir, `${contentId}.vtt`);

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  const args = [
    scriptPath,
    '--text', text,
    '--output', audioPath,
    '--subtitle', subtitlePath,
    '--voice', voice,
    '--rate', rate,
  ];

  try {
    const { stdout, stderr } = await execFileAsync(pythonCmd, args, {
      timeout: 120_000, // 2 minutes
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr) {
      console.warn('[TTS] stderr:', stderr);
    }

    // Parse JSON result from Python script
    const result = JSON.parse(stdout.trim());

    return {
      audioPath: result.audio_path,
      subtitlePath: result.subtitle_path,
      audioSizeBytes: result.audio_size_bytes,
      subtitleSizeBytes: result.subtitle_size_bytes,
      voice: result.voice,
      rate: result.rate,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`TTS generation failed: ${msg}`);
  }
}

/**
 * Convert speech speed multiplier (e.g., 1.1) to edge-tts rate string (e.g., "+10%").
 */
export function speedToRate(speed: number): string {
  const pct = Math.round((speed - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}
