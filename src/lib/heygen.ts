import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HeyGenVideoParams {
  script: string;                // 아바타가 읽을 스크립트
  avatarId?: string;             // 아바타 ID (기본: 공식 아바타)
  voiceId?: string;              // 음성 ID
  language?: 'ko' | 'en';       // 언어
  backgroundImageUrl?: string;   // 배경 이미지 URL (DALL-E 이미지)
  outputPath: string;
}

export interface HeyGenVideoResult {
  videoPath: string;
  videoId: string;
  durationSec: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const HEYGEN_API_BASE = 'https://api.heygen.com';
const POLL_INTERVAL_MS = 10_000;       // 10 seconds
const MAX_POLL_ATTEMPTS = 60;          // 10 minutes max

// Default avatar/voice settings
const DEFAULT_AVATAR_ID = 'Angela-inTshirt-20220820';
const DEFAULT_AVATAR_STYLE = 'normal';
const DEFAULT_KO_VOICE_ID = 'f04b4063c0854dc087a47b56805e0f3d';  // HeyGen Korean female
const DEFAULT_EN_VOICE_ID = '1bd001e7e50f421d891986aad5158bc8';  // HeyGen English female
const DEFAULT_BG_COLOR = '#1a5c2e';

// ─── HeyGen Video Generation ────────────────────────────────────────────────

export async function generateHeyGenVideo(params: HeyGenVideoParams): Promise<HeyGenVideoResult> {
  const {
    script,
    avatarId = DEFAULT_AVATAR_ID,
    voiceId,
    language = 'ko',
    backgroundImageUrl,
    outputPath,
  } = params;

  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    throw new Error('HEYGEN_API_KEY environment variable is not set');
  }

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Determine voice ID
  const resolvedVoiceId = voiceId || (language === 'ko' ? DEFAULT_KO_VOICE_ID : DEFAULT_EN_VOICE_ID);

  // Build background config
  const background: Record<string, unknown> = backgroundImageUrl
    ? { type: 'image', value: backgroundImageUrl }
    : { type: 'color', value: DEFAULT_BG_COLOR };

  // Step 1: Create video generation request
  const requestBody = {
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: DEFAULT_AVATAR_STYLE,
        },
        voice: {
          type: 'text',
          input_text: script,
          voice_id: resolvedVoiceId,
          speed: 1.0,
        },
        background,
      },
    ],
    dimension: {
      width: 1080,
      height: 1920,
    },
  };

  console.log('[HeyGen] Sending video generation request...');

  const createResponse = await fetch(`${HEYGEN_API_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text().catch(() => 'Unknown error');
    throw new Error(`HeyGen API video generation failed (${createResponse.status}): ${errorBody}`);
  }

  const createResult = await createResponse.json() as {
    error: string | null;
    data: { video_id: string } | null;
  };

  if (createResult.error) {
    throw new Error(`HeyGen API error: ${createResult.error}`);
  }

  const videoId = createResult.data?.video_id;
  if (!videoId) {
    throw new Error('No video_id returned from HeyGen API');
  }

  console.log(`[HeyGen] Video generation started. video_id: ${videoId}`);

  // Step 2: Poll for completion
  let videoUrl: string | undefined;
  let durationSec = 0;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    console.log(`[HeyGen] Polling status... attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS}`);

    const statusResponse = await fetch(
      `${HEYGEN_API_BASE}/v1/video_status.get?video_id=${videoId}`,
      {
        headers: {
          'X-Api-Key': apiKey,
        },
      }
    );

    if (!statusResponse.ok) {
      console.warn(`[HeyGen] Poll attempt ${attempt + 1} failed: ${statusResponse.status}`);
      continue;
    }

    const statusResult = await statusResponse.json() as {
      error: string | null;
      data: {
        status: string;
        video_url?: string;
        duration?: number;
        error?: string;
      } | null;
    };

    if (statusResult.error) {
      console.warn(`[HeyGen] Status check error: ${statusResult.error}`);
      continue;
    }

    const status = statusResult.data?.status;

    if (status === 'completed') {
      videoUrl = statusResult.data?.video_url;
      durationSec = statusResult.data?.duration || 0;
      console.log(`[HeyGen] Video completed! Duration: ${durationSec}s`);
      break;
    }

    if (status === 'failed') {
      throw new Error(`HeyGen video generation failed: ${statusResult.data?.error || 'Unknown reason'}`);
    }

    // Continue polling for 'processing', 'pending', etc.
    console.log(`[HeyGen] Status: ${status}`);
  }

  if (!videoUrl) {
    throw new Error('HeyGen video generation timed out or returned no output');
  }

  // Step 3: Download the video
  console.log('[HeyGen] Downloading generated video...');

  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download HeyGen video: ${videoResponse.status}`);
  }

  const arrayBuffer = await videoResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  console.log(`[HeyGen] Video saved to: ${outputPath} (${buffer.length} bytes)`);

  return {
    videoPath: outputPath,
    videoId,
    durationSec,
  };
}

// ─── List Available Avatars (utility) ───────────────────────────────────────

export async function listAvatars(): Promise<unknown[]> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    throw new Error('HEYGEN_API_KEY environment variable is not set');
  }

  const response = await fetch(`${HEYGEN_API_BASE}/v2/avatars`, {
    headers: {
      'X-Api-Key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list avatars: ${response.status}`);
  }

  const result = await response.json() as { error: string | null; data: { avatars: unknown[] } };
  return result.data?.avatars || [];
}
