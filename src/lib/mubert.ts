import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BGMParams {
  prompt: string;
  duration: number;
  outputPath: string;
}

export interface BGMResult {
  bgmPath: string;
  durationSec: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MUBERT_API_BASE = 'https://api-b2b.mubert.com/v2';
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60; // 3 minutes max

// ─── BGM Generation ─────────────────────────────────────────────────────────

export async function generateBGM(params: BGMParams): Promise<BGMResult> {
  const { prompt, duration, outputPath } = params;

  const apiId = process.env.MUBERT_API_ID;
  const apiToken = process.env.MUBERT_API_TOKEN;

  if (!apiId || !apiToken) {
    throw new Error('MUBERT_API_ID and MUBERT_API_TOKEN environment variables are required');
  }

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Step 1: Create track generation request
  const generateResponse = await fetch(`${MUBERT_API_BASE}/RecordTrackTTM`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method: 'RecordTrackTTM',
      params: {
        pat: apiToken,
        duration,
        tags: [],
        prompt,
        mode: 'track',
        bitrate: 320,
      },
    }),
  });

  if (!generateResponse.ok) {
    const errorBody = await generateResponse.text().catch(() => 'Unknown error');
    throw new Error(`Mubert API request failed (${generateResponse.status}): ${errorBody}`);
  }

  const generateResult = await generateResponse.json() as {
    data?: { tasks?: Array<{ task_id: string }> };
    error?: { text?: string };
  };

  if (generateResult.error?.text) {
    throw new Error(`Mubert API error: ${generateResult.error.text}`);
  }

  const taskId = generateResult.data?.tasks?.[0]?.task_id;
  if (!taskId) {
    throw new Error('No task ID returned from Mubert API');
  }

  // Step 2: Poll for completion
  let downloadUrl: string | undefined;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusResponse = await fetch(`${MUBERT_API_BASE}/TrackStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'TrackStatus',
        params: {
          pat: apiToken,
          task_id: taskId,
        },
      }),
    });

    if (!statusResponse.ok) {
      console.warn(`[Mubert] Poll attempt ${attempt + 1} failed: ${statusResponse.status}`);
      continue;
    }

    const statusResult = await statusResponse.json() as {
      data?: { tasks?: Array<{ task_status_code: number; download_link?: string }> };
    };

    const task = statusResult.data?.tasks?.[0];

    if (task?.task_status_code === 2 && task?.download_link) {
      downloadUrl = task.download_link;
      break;
    }

    if (task?.task_status_code === 3) {
      throw new Error('Mubert track generation failed');
    }

    // Continue polling for status codes 0 (queued) and 1 (processing)
  }

  if (!downloadUrl) {
    throw new Error('Mubert track generation timed out or returned no output');
  }

  // Step 3: Download the track
  const audioResponse = await fetch(downloadUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download generated BGM: ${audioResponse.status}`);
  }

  const arrayBuffer = await audioResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  return {
    bgmPath: outputPath,
    durationSec: duration,
  };
}
