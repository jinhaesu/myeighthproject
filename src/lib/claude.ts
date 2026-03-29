import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentType,
  Language,
  ScriptSection,
  VideoLength,
  AdConfig,
  Storyboard,
  StoryboardCount,
  StoryboardWithScript,
} from '@/types';
import { buildSystemPrompt, buildUserPrompt, buildStoryboardPrompt, buildNarrationPrompt } from './prompts';

// ─── Storyboard Brand Voice System Prompt ───────────────────────────────────

const STORYBOARD_SYSTEM_PROMPT = `
당신은 숏폼 광고 영상 스토리보드 전문가입니다.
주어진 비주얼 시나리오를 기반으로 영상을 정확한 수의 스토리보드로 분할합니다.
각 스토리보드는 독립적인 이미지 생성 프롬프트를 가져야 하며, 전체 영상의 일관된 시각적 스타일을 유지해야 합니다.
반드시 요청된 JSON 형식으로만 응답하세요. 추가 설명 없이 JSON만 반환하세요.
`.trim();

const NARRATION_SYSTEM_PROMPT = `
당신은 "널담"이라는 건강식품 브랜드의 콘텐츠 크리에이터입니다.
널담의 톤앤매너:
- 친근하고 따뜻한 말투 (반말 아닌 존댓말, 하지만 딱딱하지 않게)
- 신뢰감 있는 전문 정보 전달
- 시청자가 "오, 이거 좋다!" 하고 느낄 수 있도록
- 한국 식품/건강 트렌드에 맞는 내용

스토리보드별 내레이션을 작성할 때는 각 보드의 시각적 내용과 자연스럽게 어울리도록 작성하세요.
반드시 요청된 JSON 형식으로만 응답하세요. 추가 설명 없이 JSON만 반환하세요.
`.trim();

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

// ─── Storyboard Generation ──────────────────────────────────────────────────

export interface StoryboardGenerationResult {
  storyboards: Storyboard[];
}

export async function generateStoryboards(
  contentType: ContentType,
  topic: string,
  options: {
    visualScenario: string;
    storyboardCount: StoryboardCount;
    videoLength?: VideoLength;
    language?: Language;
    adConfig?: AdConfig;
    seriesInfo?: { name: string; episode: number; prefix: string };
  }
): Promise<StoryboardGenerationResult> {
  const { videoLength = 15, adConfig, seriesInfo, storyboardCount, visualScenario } = options;

  const client = getClient();
  const userPrompt = buildStoryboardPrompt(topic, {
    visualScenario,
    storyboardCount,
    videoLength,
    contentType,
    adConfig,
    seriesInfo,
  });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: STORYBOARD_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in Claude response');
  }

  const rawText = textBlock.text;
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawText];
  const jsonStr = (jsonMatch[1] ?? rawText).trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse Claude storyboard response as JSON: ${rawText.slice(0, 200)}`);
  }

  const storyboards = parsed.storyboards as Storyboard[];
  if (!Array.isArray(storyboards) || storyboards.length === 0) {
    throw new Error('Claude response missing storyboards array');
  }

  return { storyboards };
}

// ─── Narration Generation ───────────────────────────────────────────────────

export interface NarrationGenerationResult {
  storyboardsWithScript: StoryboardWithScript[];
  hooks: string[];
  ctaOptions: string[];
  fullNarration: string;
}

export async function generateNarration(
  topic: string,
  storyboards: Storyboard[],
  options: {
    contentType: ContentType;
    language?: Language;
    videoLength?: VideoLength;
    adConfig?: AdConfig;
  }
): Promise<NarrationGenerationResult> {
  const { contentType, language = 'ko', videoLength = 15, adConfig } = options;

  const client = getClient();
  const userPrompt = buildNarrationPrompt(topic, storyboards, {
    contentType,
    language,
    videoLength,
    adConfig,
  });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: NARRATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in Claude response');
  }

  const rawText = textBlock.text;
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawText];
  const jsonStr = (jsonMatch[1] ?? rawText).trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse Claude narration response as JSON: ${rawText.slice(0, 200)}`);
  }

  const scriptItems = parsed.storyboards_with_script as Array<{ index: number; narration: string }>;
  if (!Array.isArray(scriptItems) || scriptItems.length === 0) {
    throw new Error('Claude response missing storyboards_with_script array');
  }

  // Merge narration back onto original storyboard objects
  const storyboardsWithScript: StoryboardWithScript[] = storyboards.map((sb) => {
    const scriptItem = scriptItems.find((s) => s.index === sb.index);
    return {
      ...sb,
      narration: scriptItem?.narration ?? '',
    };
  });

  return {
    storyboardsWithScript,
    hooks: (parsed.hooks as string[]) || [],
    ctaOptions: (parsed.cta_options as string[]) || [],
    fullNarration: (parsed.full_narration as string) || '',
  };
}
