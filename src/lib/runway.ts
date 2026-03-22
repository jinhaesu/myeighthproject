import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AIVideoParams {
  prompt: string;
  imageUrl?: string;
  duration?: 5 | 10;
  outputPath: string;
}

export interface AIVideoResult {
  videoPath: string;
  durationSec: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes max

// ─── AI Video Generation ────────────────────────────────────────────────────

export async function generateAIVideo(params: AIVideoParams): Promise<AIVideoResult> {
  const {
    prompt,
    imageUrl,
    duration = 5,
    outputPath,
  } = params;

  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    throw new Error('RUNWAY_API_KEY environment variable is not set');
  }

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create generation task
  const createBody: Record<string, unknown> = {
    promptText: prompt,
    model: 'gen4_turbo',
    duration,
  };

  if (imageUrl) {
    createBody.promptImage = imageUrl;
  }

  const createResponse = await fetch(`${RUNWAY_API_BASE}/image_to_video`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify(createBody),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text().catch(() => 'Unknown error');
    throw new Error(`Runway API task creation failed (${createResponse.status}): ${errorBody}`);
  }

  const createResult = await createResponse.json() as { id: string };
  const taskId = createResult.id;

  if (!taskId) {
    throw new Error('No task ID returned from Runway API');
  }

  // Poll for completion
  let outputUrl: string | undefined;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusResponse = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
    });

    if (!statusResponse.ok) {
      console.warn(`[Runway] Poll attempt ${attempt + 1} failed: ${statusResponse.status}`);
      continue;
    }

    const statusResult = await statusResponse.json() as {
      status: string;
      output?: string[];
      failure?: string;
    };

    if (statusResult.status === 'SUCCEEDED') {
      outputUrl = statusResult.output?.[0];
      break;
    }

    if (statusResult.status === 'FAILED') {
      throw new Error(`Runway video generation failed: ${statusResult.failure || 'Unknown reason'}`);
    }

    // Continue polling for PENDING, THROTTLED, RUNNING states
  }

  if (!outputUrl) {
    throw new Error('Runway video generation timed out or returned no output');
  }

  // Download the video
  const videoResponse = await fetch(outputUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download generated video: ${videoResponse.status}`);
  }

  const arrayBuffer = await videoResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  return {
    videoPath: outputPath,
    durationSec: duration,
  };
}
