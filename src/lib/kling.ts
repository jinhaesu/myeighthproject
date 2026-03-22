import fs from 'fs';
import path from 'path';
import { SignJWT } from 'jose';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KlingVideoParams {
  prompt: string;
  imageUrl?: string;        // image-to-video: source image URL
  duration?: '5' | '10';    // 5s or 10s
  mode?: 'std' | 'pro';     // quality mode
  outputPath: string;
}

export interface KlingVideoResult {
  videoPath: string;
  taskId: string;
  durationSec: number;
}

export interface KlingLipSyncParams {
  videoUrl: string;          // generated video URL or path
  audioPath: string;         // TTS audio file path
  outputPath: string;
}

export interface KlingLipSyncResult {
  videoPath: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const KLING_API_BASE = 'https://api.klingai.com';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 180; // 15 minutes max

// ─── JWT Token Generation ───────────────────────────────────────────────────

async function getKlingToken(): Promise<string> {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error('KLING_ACCESS_KEY and KLING_SECRET_KEY environment variables must be set');
  }

  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({
    iss: accessKey,
    nbf: now - 5,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(now + 1800) // 30 minutes
    .sign(new TextEncoder().encode(secretKey));

  return token;
}

// ─── Image-to-Video ─────────────────────────────────────────────────────────

export async function generateKlingVideo(params: KlingVideoParams): Promise<KlingVideoResult> {
  const {
    prompt,
    imageUrl,
    duration = '5',
    mode = 'pro',
    outputPath,
  } = params;

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const token = await getKlingToken();

  // Determine endpoint: image2video if imageUrl provided, text2video otherwise
  const isImage2Video = !!imageUrl;
  const endpoint = isImage2Video
    ? `${KLING_API_BASE}/v1/videos/image2video`
    : `${KLING_API_BASE}/v1/videos/text2video`;

  // Build request body
  const body: Record<string, unknown> = {
    model_name: 'kling-v1-5',
    prompt,
    duration,
    mode,
  };

  if (isImage2Video && imageUrl) {
    body.image = imageUrl;
  }

  console.log(`[Kling] Creating ${isImage2Video ? 'image-to-video' : 'text-to-video'} task...`);

  const createResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text().catch(() => 'Unknown error');
    throw new Error(`Kling API task creation failed (${createResponse.status}): ${errorBody}`);
  }

  const createResult = await createResponse.json() as {
    code: number;
    message: string;
    data?: { task_id: string };
  };

  if (createResult.code !== 0 || !createResult.data?.task_id) {
    throw new Error(`Kling API error: ${createResult.message || 'No task ID returned'}`);
  }

  const taskId = createResult.data.task_id;
  console.log(`[Kling] Task created: ${taskId}`);

  // Poll for completion
  const pollEndpoint = isImage2Video
    ? `${KLING_API_BASE}/v1/videos/image2video/${taskId}`
    : `${KLING_API_BASE}/v1/videos/text2video/${taskId}`;

  let outputUrl: string | undefined;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    // Re-generate token for each poll in case it's close to expiry
    const pollToken = await getKlingToken();

    const statusResponse = await fetch(pollEndpoint, {
      headers: {
        'Authorization': `Bearer ${pollToken}`,
      },
    });

    if (!statusResponse.ok) {
      console.warn(`[Kling] Poll attempt ${attempt + 1} failed: ${statusResponse.status}`);
      continue;
    }

    const statusResult = await statusResponse.json() as {
      code: number;
      message: string;
      data?: {
        task_id: string;
        task_status: string;    // submitted | processing | succeed | failed
        task_status_msg?: string;
        works?: Array<{
          resource: {
            resource: string;   // video URL
          };
        }>;
      };
    };

    const status = statusResult.data?.task_status;

    if (status === 'succeed') {
      // Log full response to debug URL extraction
      console.log(`[Kling] Task succeeded after ${attempt + 1} polls. Response data:`, JSON.stringify(statusResult.data, null, 2));

      // Try multiple possible response structures
      const works = statusResult.data?.works;
      if (works && works.length > 0) {
        outputUrl = works[0]?.resource?.resource  // documented format
          || (works[0]?.resource as unknown as { url?: string })?.url  // alternative
          || (works[0] as unknown as { url?: string })?.url;  // flat format
      }

      // Also check top-level video_url
      if (!outputUrl) {
        outputUrl = (statusResult.data as unknown as { video_url?: string })?.video_url
          || (statusResult.data as unknown as { output_url?: string })?.output_url;
      }

      if (outputUrl) {
        console.log(`[Kling] Video URL found: ${outputUrl.slice(0, 100)}...`);
      } else {
        console.warn(`[Kling] Task succeeded but no video URL found in response`);
      }
      break;
    }

    if (status === 'failed') {
      throw new Error(`Kling video generation failed: ${statusResult.data?.task_status_msg || 'Unknown reason'}`);
    }

    // Continue polling for submitted, processing states
    if ((attempt + 1) % 12 === 0) {
      console.log(`[Kling] Still processing... (${Math.round((attempt + 1) * POLL_INTERVAL_MS / 1000)}s elapsed)`);
    }
  }

  if (!outputUrl) {
    throw new Error('Kling video generation timed out or returned no output');
  }

  // Download the video
  const videoResponse = await fetch(outputUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download Kling video: ${videoResponse.status}`);
  }

  const arrayBuffer = await videoResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  const durationSec = parseInt(duration, 10);

  return {
    videoPath: outputPath,
    taskId,
    durationSec,
  };
}

// ─── Lip Sync ───────────────────────────────────────────────────────────────

export async function klingLipSync(params: KlingLipSyncParams): Promise<KlingLipSyncResult> {
  const { videoUrl, audioPath, outputPath } = params;

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Read audio file and convert to base64 data URI
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const audioBase64 = audioBuffer.toString('base64');
  const audioExt = path.extname(audioPath).replace('.', '');
  const audioMime = audioExt === 'mp3' ? 'audio/mpeg' : `audio/${audioExt}`;

  const token = await getKlingToken();

  console.log('[Kling] Creating lip-sync task...');

  const createResponse = await fetch(`${KLING_API_BASE}/v1/videos/lip-sync`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      video_url: videoUrl,
      audio_type: 'file',
      audio_file: `data:${audioMime};base64,${audioBase64}`,
    }),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text().catch(() => 'Unknown error');
    throw new Error(`Kling lip-sync task creation failed (${createResponse.status}): ${errorBody}`);
  }

  const createResult = await createResponse.json() as {
    code: number;
    message: string;
    data?: { task_id: string };
  };

  if (createResult.code !== 0 || !createResult.data?.task_id) {
    throw new Error(`Kling lip-sync API error: ${createResult.message || 'No task ID returned'}`);
  }

  const taskId = createResult.data.task_id;
  console.log(`[Kling] Lip-sync task created: ${taskId}`);

  // Poll for completion
  let outputUrl: string | undefined;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const pollToken = await getKlingToken();

    const statusResponse = await fetch(`${KLING_API_BASE}/v1/videos/lip-sync/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${pollToken}`,
      },
    });

    if (!statusResponse.ok) {
      console.warn(`[Kling] Lip-sync poll attempt ${attempt + 1} failed: ${statusResponse.status}`);
      continue;
    }

    const statusResult = await statusResponse.json() as {
      code: number;
      data?: {
        task_status: string;
        task_status_msg?: string;
        works?: Array<{
          resource: {
            resource: string;
          };
        }>;
      };
    };

    const status = statusResult.data?.task_status;

    if (status === 'succeed') {
      outputUrl = statusResult.data?.works?.[0]?.resource?.resource;
      console.log(`[Kling] Lip-sync succeeded after ${attempt + 1} polls`);
      break;
    }

    if (status === 'failed') {
      throw new Error(`Kling lip-sync failed: ${statusResult.data?.task_status_msg || 'Unknown reason'}`);
    }
  }

  if (!outputUrl) {
    throw new Error('Kling lip-sync timed out or returned no output');
  }

  // Download the result video
  const videoResponse = await fetch(outputUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download lip-sync video: ${videoResponse.status}`);
  }

  const arrayBuffer = await videoResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  return { videoPath: outputPath };
}
