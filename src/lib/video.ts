import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import OpenAI from 'openai';
import { generateKlingVideo } from './kling';
import { generateAIVideo } from './runway';
import { generateSoraVideo } from './sora';
import { run as dbRun } from './db';
import type { VideoEngine } from '@/types';

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
  visual_prompt?: string;
  duration_seconds: number;
  image_url?: string;  // pre-generated key visual URL (skip DALL-E for this section)
}

// ─── Defaults (9:16 short-form) ────────────────────────────────────────────

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_BG_COLOR = '#1a1a2e';
const DEFAULT_FONT_SIZE = 22;
const MAX_SECTION_IMAGES = 4;
const MAX_SHORT_FORM_DURATION = 60;

function getDefaultFontPath(): string {
  if (process.env.VIDEO_FONT_PATH) return process.env.VIDEO_FONT_PATH;
  return process.platform === 'win32'
    ? 'C:/Windows/Fonts/malgunbd.ttf'
    : '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
}

const DEFAULT_FONT_PATH = getDefaultFontPath();

// ─── Progress Reporting ──────────────────────────────────────────────────────

function updateVideoProgress(contentId: number, currentSection: number, totalSections: number, message: string): void {
  try {
    // Update the latest 'started' video generation_log for this content
    dbRun(
      `UPDATE generation_logs SET output_result = ?
       WHERE id = (SELECT id FROM generation_logs WHERE content_id = ? AND step = 'video' AND status = 'started' ORDER BY id DESC LIMIT 1)`,
      [
        JSON.stringify({
          current_section: currentSection,
          total_sections: totalSections,
          message,
        }),
        contentId,
      ]
    );
  } catch {
    // best-effort progress update
  }
}

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

interface SectionImageResult {
  imagePath: string;
  imageUrl: string;
}

async function generateSectionImage(
  client: OpenAI,
  section: SectionInput,
  outputPath: string,
): Promise<SectionImageResult | null> {
  try {
    // Use visual_prompt from AI-generated script if available, otherwise fallback
    const prompt = section.visual_prompt || buildImagePrompt(section.body);

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
    return { imagePath: outputPath, imageUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Video] DALL-E image generation failed: ${msg}`);
    return null;
  }
}

async function generateSectionImages(
  sections: SectionInput[],
  contentId: number,
): Promise<(SectionImageResult | null)[]> {
  const isProduction = process.env.NODE_ENV === 'production';
  const outBase = isProduction ? '/tmp' : process.cwd();
  const imageDir = path.join(outBase, 'output', 'images');

  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }

  const client = getOpenAIClient();

  // Limit to MAX_SECTION_IMAGES
  const limitedSections = sections.slice(0, MAX_SECTION_IMAGES);
  const imageResults: (SectionImageResult | null)[] = [];

  for (let i = 0; i < limitedSections.length; i++) {
    const outputPath = path.join(imageDir, `${contentId}_section_${i}.png`);
    console.log(`[Video] Generating image ${i + 1}/${limitedSections.length} for content ${contentId}...`);
    const result = await generateSectionImage(client, limitedSections[i], outputPath);
    imageResults.push(result);
  }

  return imageResults;
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
    videoEngine?: VideoEngine;
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
    videoEngine = 'kling',
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
      videoEngine,
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
    videoEngine: VideoEngine;
  },
): Promise<VideoResult> {
  const { backgroundColor, fontSize, width, height, generateImages, videoPath, videoEngine } = opts;

  const isProduction = process.env.NODE_ENV === 'production';
  const outBase = isProduction ? '/tmp' : process.cwd();
  const imageDir = path.join(outBase, 'output', 'images');
  const clipDir = path.join(outBase, 'output', 'videos');

  if (!fs.existsSync(clipDir)) {
    fs.mkdirSync(clipDir, { recursive: true });
  }

  // Limit sections
  const limitedSections = sections.slice(0, MAX_SECTION_IMAGES);

  // Step 1: Generate DALL-E images for each section
  let sectionImageResults: (SectionImageResult | null)[];

  if (generateImages) {
    console.log(`[Video] Generating DALL-E images for ${limitedSections.length} sections...`);
    updateVideoProgress(contentId, 0, limitedSections.length, `DALL-E 이미지 생성 중... (${limitedSections.length}장)`);
    sectionImageResults = await generateSectionImages(limitedSections, contentId);
  } else {
    // Use pre-generated key visual URLs if available
    sectionImageResults = limitedSections.map((sec) => {
      if (sec.image_url) {
        return { imagePath: sec.image_url, imageUrl: sec.image_url };
      }
      return null;
    });
    console.log(`[Video] Using pre-generated images: ${sectionImageResults.filter(Boolean).length}/${limitedSections.length}`);
  }

  // Step 2: Convert each DALL-E image to an AI video clip using selected engine
  const engineLabel = videoEngine === 'runway' ? 'Runway' : videoEngine === 'sora' ? 'Sora' : 'Kling';

  // Check engine-specific API keys
  const hasEngineKey = checkEngineKeys(videoEngine);
  const clipPaths: string[] = [];
  const isStaticImage: boolean[] = [];

  console.log(`[Video] Engine: ${engineLabel}, API key check: ${hasEngineKey ? 'SET' : 'MISSING'}`);

  for (let i = 0; i < limitedSections.length; i++) {
    const imageResult = sectionImageResults[i];
    const clipPath = path.join(clipDir, `${contentId}_clip_${i}.mp4`);
    let clipGenerated = false;

    console.log(`[Video] Section ${i}: imageResult=${imageResult ? 'OK' : 'NULL'}, imageUrl=${imageResult?.imageUrl ? 'YES' : 'NO'}, engine=${engineLabel}`);

    // Update progress for polling
    updateVideoProgress(
      contentId,
      i + 1,
      limitedSections.length,
      `${engineLabel} 클립 ${i + 1}/${limitedSections.length} 생성 중...`
    );

    // Try AI video generation if we have API keys and (optionally) an image URL
    if (hasEngineKey) {
      try {
        const visualPrompt = limitedSections[i].visual_prompt
          ? `Smooth cinematic motion, gentle camera movement. ${limitedSections[i].visual_prompt}`
          : `Smooth cinematic motion, gentle camera movement, warm lighting. ${limitedSections[i].body.slice(0, 150).replace(/\n/g, ' ').trim()}`;

        console.log(`[Video] [${engineLabel}] Starting clip ${i + 1}/${limitedSections.length} with prompt: "${visualPrompt.slice(0, 100)}..."`);
        if (imageResult?.imageUrl) {
          console.log(`[Video] [${engineLabel}] Image URL: ${imageResult.imageUrl.slice(0, 80)}...`);
        }
        console.log(`[Video] [${engineLabel}] Output path: ${clipPath}`);

        const startTime = Date.now();

        await generateVideoClip(videoEngine, {
          prompt: visualPrompt,
          imageUrl: imageResult?.imageUrl,
          outputPath: clipPath,
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (fs.existsSync(clipPath) && fs.statSync(clipPath).size > 0) {
          const fileSize = (fs.statSync(clipPath).size / 1024 / 1024).toFixed(2);
          clipPaths.push(clipPath);
          isStaticImage.push(false);
          clipGenerated = true;
          console.log(`[Video] [${engineLabel}] Clip ${i + 1} generated successfully (${fileSize}MB, ${elapsed}s)`);
        } else {
          console.warn(`[Video] [${engineLabel}] Clip ${i + 1} file missing or empty after generation (${elapsed}s)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : '';
        console.warn(`[Video] [${engineLabel}] FAILED for section ${i}: ${msg}`);
        if (stack) console.warn(`[Video] [${engineLabel}] Stack: ${stack}`);
      }
    } else {
      console.log(`[Video] Skipping ${engineLabel} for section ${i}: API keys not configured`);
    }

    // NO FALLBACK: Engine must succeed. Static images are not acceptable.
    if (!clipGenerated) {
      const reason = !hasEngineKey
        ? getEngineMissingKeyMessage(videoEngine)
        : `${engineLabel} 영상 생성에 실패했습니다.`;
      throw new Error(`영상 생성 실패 (섹션 ${i + 1}): ${reason}`);
    }
  }

  const clipCount = clipPaths.length;
  console.log(`[Video] All ${clipCount} sections generated as ${engineLabel} video clips`);

  // Update progress: merging
  updateVideoProgress(
    contentId,
    limitedSections.length,
    limitedSections.length,
    '클립 병합 및 최종 영상 생성 중...'
  );

  // Step 3: Build ffmpeg command to concat clips + audio + subtitles
  const args: string[] = ['-y'];

  // Add each Kling video clip as input (no static images)
  for (let i = 0; i < clipPaths.length; i++) {
    args.push('-i', clipPaths[i]);
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
    const fontName = process.platform === 'win32' ? 'Malgun Gothic' : 'Noto Sans CJK KR';
    const subtitleFilter = `[vout]subtitles='${subtitlePathEscaped}':force_style='Fontname=${fontName},Fontsize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=40,MarginL=40,MarginR=40,Alignment=2'[vsub]`;
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
      timeout: 600_000, // 10 minutes
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

    // Cleanup section images and video clips
    cleanupSectionAssets(contentId, outBase);

    return { videoPath, videoSizeBytes, durationSeconds };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Video generation failed: ${msg}`);
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
    const fontName = process.platform === 'win32' ? 'Malgun Gothic' : 'Noto Sans CJK KR';
    const subtitleFilter = `subtitles='${subtitlePathEscaped}':force_style='Fontname=${fontName},Fontsize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=40,MarginL=40,MarginR=40,Alignment=2'`;

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

// ─── Engine Helpers ─────────────────────────────────────────────────────────

function checkEngineKeys(engine: VideoEngine): boolean {
  switch (engine) {
    case 'kling':
      return !!(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY);
    case 'runway':
      return !!process.env.RUNWAY_API_KEY;
    case 'sora':
      return !!(process.env.OPENAI_API_KEY || process.env.REPLICATE_API_TOKEN);
    default:
      return false;
  }
}

function getEngineMissingKeyMessage(engine: VideoEngine): string {
  switch (engine) {
    case 'kling':
      return 'Kling API 키가 설정되지 않았습니다 (KLING_ACCESS_KEY, KLING_SECRET_KEY)';
    case 'runway':
      return 'Runway API 키가 설정되지 않았습니다 (RUNWAY_API_KEY)';
    case 'sora':
      return 'Sora API 키가 설정되지 않았습니다 (OPENAI_API_KEY 또는 REPLICATE_API_TOKEN)';
    default:
      return 'API 키가 설정되지 않았습니다';
  }
}

async function generateVideoClip(
  engine: VideoEngine,
  params: { prompt: string; imageUrl?: string; outputPath: string },
): Promise<void> {
  switch (engine) {
    case 'kling':
      await generateKlingVideo({
        prompt: params.prompt,
        imageUrl: params.imageUrl,
        duration: '5',
        outputPath: params.outputPath,
      });
      break;

    case 'runway':
      await generateAIVideo({
        prompt: params.prompt,
        imageUrl: params.imageUrl,
        duration: 5,
        outputPath: params.outputPath,
      });
      break;

    case 'sora':
      await generateSoraVideo({
        prompt: params.prompt,
        imageUrl: params.imageUrl,
        duration: 5,
        outputPath: params.outputPath,
      });
      break;

    default:
      throw new Error(`Unknown video engine: ${engine}`);
  }
}

// ─── Cleanup ───────────────────────────────────────────────────────────────

function cleanupSectionAssets(contentId: number, outBase: string): void {
  try {
    // Cleanup section images
    const imageDir = path.join(outBase, 'output', 'images');
    if (fs.existsSync(imageDir)) {
      const imageFiles = fs.readdirSync(imageDir);
      for (const file of imageFiles) {
        if (file.startsWith(`${contentId}_section_`) || file.startsWith(`${contentId}_fallback_`)) {
          fs.unlinkSync(path.join(imageDir, file));
        }
      }
    }

    // Cleanup Kling video clips
    const videoDir = path.join(outBase, 'output', 'videos');
    if (fs.existsSync(videoDir)) {
      const videoFiles = fs.readdirSync(videoDir);
      for (const file of videoFiles) {
        if (file.startsWith(`${contentId}_clip_`)) {
          fs.unlinkSync(path.join(videoDir, file));
        }
      }
    }
  } catch {
    // cleanup is best-effort
  }
}
