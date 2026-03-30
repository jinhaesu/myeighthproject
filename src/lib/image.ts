import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImageGenerationParams {
  prompt: string;
  style?: 'natural' | 'vivid';
  size?: '1024x1024' | '1024x1792' | '1792x1024';
  outputPath: string;
}

export interface ImageGenerationResult {
  imagePath: string;
  revisedPrompt: string;
  originalUrl: string;  // Original DALL-E CDN URL (publicly accessible, temporary)
}

// ─── Client ─────────────────────────────────────────────────────────────────

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

// ─── Image Generation ───────────────────────────────────────────────────────

export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  const {
    prompt,
    style = 'vivid',
    size = '1024x1024',
    outputPath,
  } = params;

  const client = getClient();

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Try gpt-image-1 first, fall back to dall-e-3
  let imageUrl: string | undefined;
  let revisedPrompt = prompt;

  try {
    // DALL-E 3 approach (returns URL)
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      style,
      response_format: 'url',
    });

    imageUrl = response.data?.[0]?.url;
    revisedPrompt = response.data?.[0]?.revised_prompt || prompt;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Image generation failed: ${msg}`);
  }

  if (!imageUrl) {
    throw new Error('No image URL returned from OpenAI');
  }

  // Download the image
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download generated image: ${imageResponse.status}`);
  }

  const arrayBuffer = await imageResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  return {
    imagePath: outputPath,
    revisedPrompt,
    originalUrl: imageUrl,
  };
}
