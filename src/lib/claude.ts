import Anthropic from '@anthropic-ai/sdk';
import type { ContentType, Language, ScriptSection } from '@/types';
import { buildSystemPrompt, buildUserPrompt } from './prompts';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScriptGenerationResult {
  title: string;
  sections: ScriptSection[];
  fullScript: string;
  tags: string[];
  totalDuration: number;
}

// ─── Client ─────────────────────────────────────────────────────────────────

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  return new Anthropic({ apiKey });
}

// ─── Script Generation ─────────────────────────────────────────────────────

export async function generateScript(
  contentType: ContentType,
  topic: string,
  options: {
    language?: Language;
    keywords?: string[];
    additionalInstructions?: string;
  } = {}
): Promise<ScriptGenerationResult> {
  const {
    language = 'ko',
    keywords = [],
    additionalInstructions,
  } = options;

  const client = getClient();
  const systemPrompt = buildSystemPrompt(contentType, language);
  const userPrompt = buildUserPrompt(topic, keywords, additionalInstructions);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
  });

  // Extract text content from the response
  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in Claude response');
  }

  const rawText = textBlock.text;

  // Parse JSON from the response (handle markdown code blocks)
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawText];
  const jsonStr = (jsonMatch[1] ?? rawText).trim();

  let parsed: {
    title: string;
    sections: ScriptSection[];
    total_duration_seconds?: number;
    tags?: string[];
  };

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${rawText.slice(0, 200)}`);
  }

  // Validate sections
  if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error('Claude response missing sections array');
  }

  // Build full script from sections (body only, no tags - TTS reads this directly)
  const fullScript = parsed.sections
    .sort((a, b) => a.order - b.order)
    .map((s) => s.body)
    .join('\n\n');

  const totalDuration = parsed.sections.reduce(
    (sum, s) => sum + (s.duration_seconds || 0),
    0
  );

  return {
    title: parsed.title || topic,
    sections: parsed.sections,
    fullScript,
    tags: parsed.tags || [],
    totalDuration: parsed.total_duration_seconds || totalDuration,
  };
}
