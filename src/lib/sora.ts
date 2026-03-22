import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SoraVideoParams {
  prompt: string;
  imageUrl?: string;
  duration?: number; // 5-20 seconds
  outputPath: string;
}

export interface SoraVideoResult {
  videoPath: string;
  durationSec: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 180; // 15 minutes max

// ─── Sora Video Generation ─────────────────────────────────────────────────
// Uses OpenAI Sora API. Falls back to Replicate if Sora is unavailable.

export async function generateSoraVideo(params: SoraVideoParams): Promise<SoraVideoResult> {
  const {
    prompt,
    imageUrl,
    duration = 10,
    outputPath,
  } = params;

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Try OpenAI Sora API first, fall back to Replicate
  const openaiKey = process.env.OPENAI_API_KEY;
  const replicateToken = process.env.REPLICATE_API_TOKEN;

  if (openaiKey) {
    try {
      return await generateViaSoraAPI(prompt, imageUrl, duration, outputPath, openaiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Sora] OpenAI Sora API failed: ${msg}, trying Replicate fallback...`);
    }
  }

  if (replicateToken) {
    return await generateViaReplicate(prompt, imageUrl, duration, outputPath, replicateToken);
  }

  throw new Error('Sora: OPENAI_API_KEY or REPLICATE_API_TOKEN must be set');
}

// ─── OpenAI Sora API ────────────────────────────────────────────────────────

async function generateViaSoraAPI(
  prompt: string,
  imageUrl: string | undefined,
  duration: number,
  outputPath: string,
  apiKey: string,
): Promise<SoraVideoResult> {
  console.log(`[Sora] Creating video generation task via OpenAI API...`);

  const body: Record<string, unknown> = {
    model: 'sora',
    prompt,
    n: 1,
    duration,
    size: '1080x1920', // 9:16 vertical format
  };

  if (imageUrl) {
    body.image = { url: imageUrl };
  }

  // Create generation request
  const createResponse = await fetch('https://api.openai.com/v1/videos/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text().catch(() => 'Unknown error');
    throw new Error(`Sora API creation failed (${createResponse.status}): ${errorBody}`);
  }

  const createResult = await createResponse.json() as {
    id?: string;
    status?: string;
    data?: Array<{ url?: string }>;
  };

  // If synchronous response with data
  if (createResult.data && createResult.data.length > 0 && createResult.data[0].url) {
    const videoUrl = createResult.data[0].url;
    await downloadVideo(videoUrl, outputPath);
    return { videoPath: outputPath, durationSec: duration };
  }

  // If async, poll for completion
  const taskId = createResult.id;
  if (!taskId) {
    throw new Error('Sora API returned no task ID or video data');
  }

  console.log(`[Sora] Task created: ${taskId}, polling for completion...`);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusResponse = await fetch(`https://api.openai.com/v1/videos/generations/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!statusResponse.ok) {
      console.warn(`[Sora] Poll attempt ${attempt + 1} failed: ${statusResponse.status}`);
      continue;
    }

    const statusResult = await statusResponse.json() as {
      status?: string;
      data?: Array<{ url?: string }>;
      error?: { message?: string };
    };

    if (statusResult.status === 'completed' || statusResult.status === 'succeeded') {
      const videoUrl = statusResult.data?.[0]?.url;
      if (!videoUrl) {
        throw new Error('Sora completed but no video URL returned');
      }
      console.log(`[Sora] Video generated successfully after ${attempt + 1} polls`);
      await downloadVideo(videoUrl, outputPath);
      return { videoPath: outputPath, durationSec: duration };
    }

    if (statusResult.status === 'failed') {
      throw new Error(`Sora generation failed: ${statusResult.error?.message || 'Unknown reason'}`);
    }

    if ((attempt + 1) % 12 === 0) {
      console.log(`[Sora] Still processing... (${Math.round((attempt + 1) * POLL_INTERVAL_MS / 1000)}s elapsed)`);
    }
  }

  throw new Error('Sora video generation timed out');
}

// ─── Replicate Fallback ─────────────────────────────────────────────────────

async function generateViaReplicate(
  prompt: string,
  imageUrl: string | undefined,
  duration: number,
  outputPath: string,
  apiToken: string,
): Promise<SoraVideoResult> {
  console.log(`[Sora] Using Replicate fallback for video generation...`);

  // Use a high-quality video generation model on Replicate
  const input: Record<string, unknown> = {
    prompt,
    duration,
  };

  if (imageUrl) {
    input.image = imageUrl;
  }

  // Try minimax/video-01-live as a high-quality alternative
  const model = 'minimax/video-01-live';

  const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input,
    }),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text().catch(() => 'Unknown error');
    throw new Error(`Replicate API creation failed (${createResponse.status}): ${errorBody}`);
  }

  const createResult = await createResponse.json() as {
    id: string;
    status: string;
    urls: { get: string };
  };

  const predictionUrl = createResult.urls?.get;
  if (!predictionUrl) {
    throw new Error('No prediction URL returned from Replicate');
  }

  console.log(`[Sora/Replicate] Prediction created: ${createResult.id}`);

  // Poll for completion
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusResponse = await fetch(predictionUrl, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
    });

    if (!statusResponse.ok) {
      console.warn(`[Sora/Replicate] Poll attempt ${attempt + 1} failed: ${statusResponse.status}`);
      continue;
    }

    const statusResult = await statusResponse.json() as {
      status: string;
      output?: string | string[];
      error?: string;
    };

    if (statusResult.status === 'succeeded') {
      const output = statusResult.output;
      let videoUrl: string | undefined;

      if (typeof output === 'string') {
        videoUrl = output;
      } else if (Array.isArray(output) && output.length > 0) {
        videoUrl = output[0];
      }

      if (!videoUrl) {
        throw new Error('Replicate succeeded but no video URL returned');
      }

      console.log(`[Sora/Replicate] Video generated after ${attempt + 1} polls`);
      await downloadVideo(videoUrl, outputPath);
      return { videoPath: outputPath, durationSec: duration };
    }

    if (statusResult.status === 'failed') {
      throw new Error(`Replicate generation failed: ${statusResult.error || 'Unknown reason'}`);
    }

    if ((attempt + 1) % 12 === 0) {
      console.log(`[Sora/Replicate] Still processing... (${Math.round((attempt + 1) * POLL_INTERVAL_MS / 1000)}s elapsed)`);
    }
  }

  throw new Error('Sora/Replicate video generation timed out');
}

// ─── Download Helper ────────────────────────────────────────────────────────

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);
}
