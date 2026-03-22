import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VideoOptions {
  backgroundColor?: string;   // hex color e.g. "#1a1a2e"
  backgroundImage?: string;   // path to background image
  fontSize?: number;
  fontPath?: string;
  width?: number;
  height?: number;
}

export interface VideoResult {
  videoPath: string;
  videoSizeBytes: number;
  durationSeconds: number;
}

// ─── Defaults (9:16 short-form) ────────────────────────────────────────────

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_BG_COLOR = '#1a1a2e';
const DEFAULT_FONT_SIZE = 42;

function getDefaultFontPath(): string {
  if (process.env.VIDEO_FONT_PATH) return process.env.VIDEO_FONT_PATH;
  return process.platform === 'win32'
    ? 'C:/Windows/Fonts/malgunbd.ttf'
    : '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
}

const DEFAULT_FONT_PATH = getDefaultFontPath();

// ─── Video Generation ──────────────────────────────────────────────────────

export async function generateVideo(
  contentId: number,
  audioPath: string,
  subtitlePath: string,
  options: VideoOptions = {}
): Promise<VideoResult> {
  const {
    backgroundColor = DEFAULT_BG_COLOR,
    backgroundImage,
    fontSize = DEFAULT_FONT_SIZE,
    fontPath = DEFAULT_FONT_PATH,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
  } = options;

  const isProduction = process.env.NODE_ENV === 'production';
  const outBase = isProduction ? '/tmp' : process.cwd();
  const videoPath = path.join(outBase, 'output', 'videos', `${contentId}.mp4`);

  // Ensure output directory exists
  const videoDir = path.dirname(videoPath);
  if (!fs.existsSync(videoDir)) {
    fs.mkdirSync(videoDir, { recursive: true });
  }

  // Validate inputs
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }
  if (!fs.existsSync(subtitlePath)) {
    throw new Error(`Subtitle file not found: ${subtitlePath}`);
  }

  // Convert VTT path to use forward slashes and escape for ffmpeg filter
  const subtitlePathEscaped = subtitlePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:');

  // Build subtitle filter with styling
  // Note: libass uses 'Fontsize' (lowercase s) on some builds
  const fontName = process.platform === 'win32' ? 'Malgun Gothic Bold' : 'Noto Sans CJK KR Bold';
  const subtitleFilter = `subtitles='${subtitlePathEscaped}':force_style='Fontname=${fontName},Fontsize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,MarginV=120,Alignment=2'`;

  // Build ffmpeg args
  const args: string[] = ['-y'];

  // Input: background
  if (backgroundImage && fs.existsSync(backgroundImage)) {
    // Use image as background, loop it for audio duration
    args.push('-loop', '1', '-i', backgroundImage);
  } else {
    // Generate solid color background
    args.push(
      '-f', 'lavfi',
      '-i', `color=c=${backgroundColor.replace('#', '0x')}:s=${width}x${height}:r=30`
    );
  }

  // Input: audio
  args.push('-i', audioPath);

  // Filter complex: scale background + overlay subtitles
  if (backgroundImage && fs.existsSync(backgroundImage)) {
    args.push(
      '-filter_complex',
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,${subtitleFilter}[v]`,
      '-map', '[v]',
      '-map', '1:a',
    );
  } else {
    args.push(
      '-vf', subtitleFilter,
    );
  }

  // Output settings
  args.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    videoPath,
  );

  try {
    const { stderr } = await execFileAsync('ffmpeg', args, {
      timeout: 300_000, // 5 minutes
      maxBuffer: 50 * 1024 * 1024,
    });

    // ffmpeg writes progress to stderr, this is normal
    if (stderr && process.env.NODE_ENV === 'development') {
      console.log('[Video] ffmpeg output:', stderr.slice(-500));
    }

    // Read video file info
    const videoSizeBytes = fs.statSync(videoPath).size;

    // Get duration via ffprobe
    let durationSeconds = 0;
    try {
      const { stdout: probeOut } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ]);
      durationSeconds = parseFloat(probeOut.trim()) || 0;
    } catch {
      // ffprobe not available — duration unknown, non-critical
    }

    return {
      videoPath,
      videoSizeBytes,
      durationSeconds,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Video generation failed: ${msg}`);
  }
}
