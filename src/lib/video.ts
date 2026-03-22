import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import OpenAI from 'openai';

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

export interface SectionInput {
  body: string;
  duration_seconds: number;
}

// ─── Defaults (9:16 short-form) ────────────────────────────────────────────

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_BG_COLOR = '#1a1a2e';
const DEFAULT_FONT_SIZE = 42;
const MAX_SECTION_IMAGES = 5;
const MAX_SHORT_FORM_DURATION = 60;

function getDefaultFontPath(): string {
  if (process.env.VIDEO_FONT_PATH) return process.env.VIDEO_FONT_PATH;
  return process.platform === 'win32'
    ? 'C:/Windows/Fonts/malgunbd.ttf'
    : '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
}

const DEFAULT_FONT_PATH = getDefaultFontPath();

// ─── OpenAI Client ─────────────────────────────────────────────────────────

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

// ─── DALL-E Image Generation for Sections ──────────────────────────────────

function buildImagePrompt(sectionBody: string): string {
  // Extract key topic from section body (first 100 chars for context)
  const topic = sectionBody.slice(0, 150).replace(/\n/g, ' ').trim();
  return `Professional food photography style, ${topic}, clean bright background, high quality, appetizing, warm lighting, 9:16 vertical format. No text overlay.`;
}

async function generateSectionImage(
  client: OpenAI,
  sectionBody: string,
  outputPath: string,
): Promise<string | null> {
  try {
    const prompt = buildImagePrompt(sectionBody);

    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1792',
      style: 'vivid',
      response_format: 'url',
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      console.warn('[Video] DALL-E returned no image URL');
      return null;
    }

    // Download image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.warn(`[Video] Failed to download DALL-E image: ${imageResponse.status}`);
      return null;
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Video] DALL-E image generation failed: ${msg}`);
    return null;
  }
}

async function generateSectionImages(
  sections: SectionInput[],
  contentId: number,
): Promise<(string | null)[]> {
  const isProduction = process.env.NODE_ENV === 'production';
  const outBase = isProduction ? '/tmp' : process.cwd();
  const imageDir = path.join(outBase, 'output', 'images');

  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }

  const client = getOpenAIClient();

  // Limit to MAX_SECTION_IMAGES
  const limitedSections = sections.slice(0, MAX_SECTION_IMAGES);
  const imagePaths: (string | null)[] = [];

  for (let i = 0; i < limitedSections.length; i++) {
    const outputPath = path.join(imageDir, `${contentId}_section_${i}.png`);
    console.log(`[Video] Generating image ${i + 1}/${limitedSections.length} for content ${contentId}...`);
    const result = await generateSectionImage(client, limitedSections[i].body, outputPath);
    imagePaths.push(result);
  }

  return imagePaths;
}

// ─── Solid color fallback image ────────────────────────────────────────────

async function generateSolidColorImage(
  color: string,
  width: number,
  height: number,
  outputPath: string,
): Promise<void> {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const hexColor = color.replace('#', '0x');
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=${hexColor}:s=${width}x${height}:d=1`,
    '-frames:v', '1',
    outputPath,
  ], { timeout: 30_000 });
}

// ─── Duration Warning ──────────────────────────────────────────────────────

function checkDurationWarning(sections: SectionInput[]): string | null {
  const totalDuration = sections.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
  if (totalDuration > MAX_SHORT_FORM_DURATION) {
    return `Warning: Total script duration (${totalDuration}s) exceeds ${MAX_SHORT_FORM_DURATION}s short-form limit. Consider trimming the script.`;
  }
  return null;
}

// ─── Video Generation (Slideshow) ──────────────────────────────────────────

export async function generateVideo(
  contentId: number,
  audioPath: string,
  subtitlePath: string | null,
  options: VideoOptions & {
    sections?: SectionInput[];
    generateImages?: boolean;
  } = {}
): Promise<VideoResult> {
  const {
    backgroundColor = DEFAULT_BG_COLOR,
    backgroundImage,
    fontSize = DEFAULT_FONT_SIZE,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    sections,
    generateImages = true,
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

  // Check duration warning
  if (sections && sections.length > 0) {
    const warning = checkDurationWarning(sections);
    if (warning) {
      console.warn(`[Video] ${warning}`);
    }
  }

  // Determine if we should do slideshow mode
  const useSlideshowMode = sections && sections.length > 0;

  if (useSlideshowMode) {
    return generateSlideshowVideo(contentId, audioPath, subtitlePath, sections, {
      backgroundColor,
      fontSize,
      width,
      height,
      generateImages,
      videoPath,
    });
  }

  // Legacy single-background mode
  return generateLegacyVideo(contentId, audioPath, subtitlePath, {
    backgroundColor,
    backgroundImage,
    fontSize,
    width,
    height,
    videoPath,
  });
}

// ─── Slideshow Video (New) ─────────────────────────────────────────────────

async function generateSlideshowVideo(
  contentId: number,
  audioPath: string,
  subtitlePath: string | null,
  sections: SectionInput[],
  opts: {
    backgroundColor: string;
    fontSize: number;
    width: number;
    height: number;
    generateImages: boolean;
    videoPath: string;
  },
): Promise<VideoResult> {
  const { backgroundColor, fontSize, width, height, generateImages, videoPath } = opts;

  // Limit sections
  const limitedSections = sections.slice(0, MAX_SECTION_IMAGES);

  // Generate or create fallback images for each section
  let sectionImagePaths: (string | null)[];

  if (generateImages) {
    console.log(`[Video] Generating DALL-E images for ${limitedSections.length} sections...`);
    sectionImagePaths = await generateSectionImages(limitedSections, contentId);
  } else {
    sectionImagePaths = limitedSections.map(() => null);
  }

  // For any section that failed image generation, create solid color fallback
  const isProduction = process.env.NODE_ENV === 'production';
  const outBase = isProduction ? '/tmp' : process.cwd();
  const imageDir = path.join(outBase, 'output', 'images');

  const finalImagePaths: string[] = [];
  for (let i = 0; i < limitedSections.length; i++) {
    if (sectionImagePaths[i] && fs.existsSync(sectionImagePaths[i]!)) {
      finalImagePaths.push(sectionImagePaths[i]!);
    } else {
      // Generate solid color fallback
      const fallbackPath = path.join(imageDir, `${contentId}_fallback_${i}.png`);
      console.log(`[Video] Using solid color fallback for section ${i}`);
      await generateSolidColorImage(backgroundColor, width, height, fallbackPath);
      finalImagePaths.push(fallbackPath);
    }
  }

  // Build ffmpeg command for slideshow
  const args: string[] = ['-y'];

  // Add each image as input with its duration
  for (let i = 0; i < limitedSections.length; i++) {
    const duration = Math.max(limitedSections[i].duration_seconds || 5, 1);
    args.push('-loop', '1', '-t', String(duration), '-i', finalImagePaths[i]);
  }

  // Add audio input
  args.push('-i', audioPath);
  const audioInputIndex = limitedSections.length;

  // Build filter_complex for concat
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  for (let i = 0; i < limitedSections.length; i++) {
    filterParts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}]`
    );
    concatInputs.push(`[v${i}]`);
  }

  const concatFilter = `${concatInputs.join('')}concat=n=${limitedSections.length}:v=1:a=0[vout]`;
  filterParts.push(concatFilter);

  // Add subtitle filter if subtitle file exists
  let finalVideoLabel = '[vout]';
  if (subtitlePath && fs.existsSync(subtitlePath)) {
    const subtitlePathEscaped = subtitlePath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\:');
    const fontName = process.platform === 'win32' ? 'Malgun Gothic Bold' : 'Noto Sans CJK KR Bold';
    const subtitleFilter = `[vout]subtitles='${subtitlePathEscaped}':force_style='Fontname=${fontName},Fontsize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,MarginV=120,Alignment=2'[vsub]`;
    filterParts.push(subtitleFilter);
    finalVideoLabel = '[vsub]';
  }

  args.push('-filter_complex', filterParts.join(';'));

  // Map outputs
  args.push('-map', finalVideoLabel, '-map', `${audioInputIndex}:a`);

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
      timeout: 600_000, // 10 minutes (image generation + encoding)
      maxBuffer: 50 * 1024 * 1024,
    });

    if (stderr && process.env.NODE_ENV === 'development') {
      console.log('[Video] ffmpeg output:', stderr.slice(-500));
    }

    const videoSizeBytes = fs.statSync(videoPath).size;
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
      // ffprobe not available
    }

    // Cleanup section images
    cleanupSectionImages(contentId, outBase);

    return { videoPath, videoSizeBytes, durationSeconds };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Slideshow video generation failed: ${msg}`);
  }
}

// ─── Legacy Single-Background Video ────────────────────────────────────────

async function generateLegacyVideo(
  contentId: number,
  audioPath: string,
  subtitlePath: string | null,
  opts: {
    backgroundColor: string;
    backgroundImage?: string;
    fontSize: number;
    width: number;
    height: number;
    videoPath: string;
  },
): Promise<VideoResult> {
  const { backgroundColor, backgroundImage, fontSize, width, height, videoPath } = opts;

  // Build ffmpeg args
  const args: string[] = ['-y'];

  // Input: background
  if (backgroundImage && fs.existsSync(backgroundImage)) {
    args.push('-loop', '1', '-i', backgroundImage);
  } else {
    args.push(
      '-f', 'lavfi',
      '-i', `color=c=${backgroundColor.replace('#', '0x')}:s=${width}x${height}:r=30`
    );
  }

  // Input: audio
  args.push('-i', audioPath);

  // Filter complex: scale background + overlay subtitles
  if (subtitlePath && fs.existsSync(subtitlePath)) {
    const subtitlePathEscaped = subtitlePath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\:');
    const fontName = process.platform === 'win32' ? 'Malgun Gothic Bold' : 'Noto Sans CJK KR Bold';
    const subtitleFilter = `subtitles='${subtitlePathEscaped}':force_style='Fontname=${fontName},Fontsize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,MarginV=120,Alignment=2'`;

    if (backgroundImage && fs.existsSync(backgroundImage)) {
      args.push(
        '-filter_complex',
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,${subtitleFilter}[v]`,
        '-map', '[v]',
        '-map', '1:a',
      );
    } else {
      args.push('-vf', subtitleFilter);
    }
  } else {
    // No subtitles
    if (backgroundImage && fs.existsSync(backgroundImage)) {
      args.push(
        '-filter_complex',
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[v]`,
        '-map', '[v]',
        '-map', '1:a',
      );
    }
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
      timeout: 300_000,
      maxBuffer: 50 * 1024 * 1024,
    });

    if (stderr && process.env.NODE_ENV === 'development') {
      console.log('[Video] ffmpeg output:', stderr.slice(-500));
    }

    const videoSizeBytes = fs.statSync(videoPath).size;
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
      // ffprobe not available
    }

    return { videoPath, videoSizeBytes, durationSeconds };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Video generation failed: ${msg}`);
  }
}

// ─── Cleanup ───────────────────────────────────────────────────────────────

function cleanupSectionImages(contentId: number, outBase: string): void {
  try {
    const imageDir = path.join(outBase, 'output', 'images');
    if (!fs.existsSync(imageDir)) return;
    const files = fs.readdirSync(imageDir);
    for (const file of files) {
      if (file.startsWith(`${contentId}_section_`) || file.startsWith(`${contentId}_fallback_`)) {
        fs.unlinkSync(path.join(imageDir, file));
      }
    }
  } catch {
    // cleanup is best-effort
  }
}
