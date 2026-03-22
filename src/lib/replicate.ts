import Replicate from 'replicate';
import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReplicateParams {
  model: string;
  input: Record<string, unknown>;
  outputPath: string;
}

export interface ReplicateResult {
  outputPath: string;
}

// ─── Client ─────────────────────────────────────────────────────────────────

function getClient(): Replicate {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }
  return new Replicate({ auth: apiToken });
}

// ─── Replicate Generation ───────────────────────────────────────────────────

export async function generateWithReplicate(params: ReplicateParams): Promise<ReplicateResult> {
  const { model, input, outputPath } = params;

  const client = getClient();

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Parse model identifier (e.g., "kling-ai/kling-v2")
  const [owner, name] = model.split('/');
  if (!owner || !name) {
    throw new Error(`Invalid model format: "${model}". Expected "owner/model-name".`);
  }

  // Run the model
  const output = await client.run(`${owner}/${name}` as `${string}/${string}`, { input });

  // Handle different output types
  let downloadUrl: string | undefined;

  if (typeof output === 'string') {
    downloadUrl = output;
  } else if (Array.isArray(output) && typeof output[0] === 'string') {
    downloadUrl = output[0];
  } else if (output && typeof output === 'object' && 'url' in (output as Record<string, unknown>)) {
    downloadUrl = (output as Record<string, unknown>).url as string;
  }

  if (!downloadUrl) {
    // If output is a ReadableStream or other format, try to handle it
    if (output instanceof ReadableStream) {
      const reader = output.getReader();
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) chunks.push(result.value);
      }
      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(outputPath, buffer);
      return { outputPath };
    }

    throw new Error(`Unexpected output format from Replicate model: ${JSON.stringify(output).slice(0, 200)}`);
  }

  // Download the output
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Replicate output: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  return { outputPath };
}
