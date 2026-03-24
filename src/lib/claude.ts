import Anthropic from '@anthropic-ai/sdk';
import type { ContentType, Language, ScriptSection, VideoLength, AdConfig } from '@/types';
import { buildSystemPrompt, buildUserPrompt } from './prompts';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScriptGenerationResult {
  title: string;
  sections: ScriptSection[];
  fullScript: string;
  tags: string[];
  totalDuration: number;
  hooks?: string[];
  ctaOptions?: string[];
  voiceoverScript?: string;
  subtitles?: string[];
  visualScenario?: string;
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
    videoLength?: VideoLength;
    adConfig?: AdConfig;
    visual_scenario?: string;
    seriesInfo?: { name: string; episode: number; prefix: string };
  } = {}
): Promise<ScriptGenerationResult> {
  const {
    language = 'ko',
    keywords = [],
    additionalInstructions,
    videoLength = 60,
    adConfig,
    visual_scenario,
    seriesInfo,
  } = options;

  const client = getClient();
  const systemPrompt = buildSystemPrompt(contentType, language, videoLength);
  const userPrompt = buildUserPrompt(topic, {
    keywords,
    additionalInstructions,
    videoLength,
    adConfig,
    visual_scenario,
    seriesInfo,
  });

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

  const isAdFormat = videoLength <= 30 || adConfig !== undefined;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${rawText.slice(0, 200)}`);
  }

  const visualScenario = (parsed.visual_scenario as string) || undefined;

  if (isAdFormat) {
    // Ad format: shot_list based
    const shotList = parsed.shot_list as ScriptSection[] | undefined;
    if (!Array.isArray(shotList) || shotList.length === 0) {
      throw new Error('Claude response missing shot_list array');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sections: ScriptSection[] = (shotList as any[]).map((shot, idx: number) => ({
      order: shot.order || idx + 1,
      title: shot.title || `샷 ${idx + 1}`,
      body: shot.body || '',
      duration_seconds: shot.duration_seconds || 2,
      shot_type: shot.shot_type as ScriptSection['shot_type'],
      visual_description: shot.visual_description || '',
    }));

    const voiceoverScript = (parsed.voiceover_script as string) || '';
    const fullScript = voiceoverScript || sections
      .sort((a, b) => a.order - b.order)
      .map((s) => s.body)
      .filter(Boolean)
      .join(' ');

    const totalDuration = sections.reduce(
      (sum, s) => sum + (s.duration_seconds || 0),
      0
    );

    return {
      title: (parsed.title as string) || topic,
      sections,
      fullScript,
      tags: (parsed.tags as string[]) || [],
      totalDuration: (parsed.total_duration_seconds as number) || totalDuration,
      hooks: (parsed.hooks as string[]) || [],
      ctaOptions: (parsed.cta_options as string[]) || [],
      voiceoverScript,
      subtitles: (parsed.subtitles as string[]) || [],
      visualScenario,
    };
  } else {
    // Content format: sections based
    const sections = parsed.sections as ScriptSection[];
    if (!Array.isArray(sections) || sections.length === 0) {
      throw new Error('Claude response missing sections array');
    }

    const fullScript = sections
      .sort((a, b) => a.order - b.order)
      .map((s) => `[${s.title}]\n${s.body}`)
      .join('\n\n');

    const totalDuration = sections.reduce(
      (sum, s) => sum + (s.duration_seconds || 0),
      0
    );

    return {
      title: (parsed.title as string) || topic,
      sections,
      fullScript,
      tags: (parsed.tags as string[]) || [],
      totalDuration: (parsed.total_duration_seconds as number) || totalDuration,
      visualScenario,
    };
  }
}
