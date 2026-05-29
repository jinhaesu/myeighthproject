import Anthropic from '@anthropic-ai/sdk';
import type { Platform, Language } from '@/types';

// ─── Platform character limits ──────────────────────────────────────────────

const PLATFORM_LIMITS: Record<Platform, number> = {
  instagram: 2200,
  youtube: 5000,
  tiktok: 300,
  facebook: 3000,
};

const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
};

// ─── Brand hashtags ─────────────────────────────────────────────────────────

const BRAND_HASHTAGS_KO = ['#널담', '#nuldam', '#건강식품', '#K_Food', '#조인앤조인'];
const BRAND_HASHTAGS_EN = ['#nuldam', '#healthyfood', '#KFood', '#JoinAndJoin'];

// ─── Caption Generation ─────────────────────────────────────────────────────

export interface CaptionResult {
  caption: string;
  hashtags: string[];
}

export async function generateCaption(
  script: string,
  platform: Platform,
  language: Language = 'ko'
): Promise<CaptionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const client = new Anthropic({ apiKey });
  const maxLength = PLATFORM_LIMITS[platform];
  const platformLabel = PLATFORM_LABELS[platform];
  const brandHashtags = language === 'ko' ? BRAND_HASHTAGS_KO : BRAND_HASHTAGS_EN;

  const systemPrompt = language === 'ko'
    ? `당신은 "널담" 건강식품 브랜드의 SNS 마케터입니다.
주어진 영상 스크립트를 기반으로 ${platformLabel}용 게시물 캡션과 해시태그를 생성해주세요.

규칙:
- 캡션 최대 길이: ${maxLength}자
- 해시태그 15개 생성 (브랜드 해시태그 제외)
- 친근하고 전문적인 톤
- 시청자의 관심을 끌 수 있는 캡션
- CTA(Call to Action) 포함
- 이모지 적절히 활용

반드시 아래 JSON 형식으로만 응답:
{
  "caption": "캡션 내용",
  "hashtags": ["해시태그1", "해시태그2", ...]
}`
    : `You are a social media marketer for "Nuldam", a health food brand.
Generate a ${platformLabel} post caption and hashtags based on the given video script.

Rules:
- Maximum caption length: ${maxLength} characters
- Generate 15 hashtags (excluding brand hashtags)
- Friendly yet professional tone
- Eye-catching caption
- Include CTA
- Use emojis appropriately

Respond ONLY in this JSON format:
{
  "caption": "Caption text",
  "hashtags": ["hashtag1", "hashtag2", ...]
}`;

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: language === 'ko'
          ? `다음 영상 스크립트를 기반으로 ${platformLabel} 캡션과 해시태그를 만들어주세요:\n\n${script}`
          : `Create a ${platformLabel} caption and hashtags based on this video script:\n\n${script}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in Claude response');
  }

  const rawText = textBlock.text;
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawText];
  const jsonStr = (jsonMatch[1] ?? rawText).trim();

  let parsed: { caption: string; hashtags: string[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse caption response as JSON: ${rawText.slice(0, 200)}`);
  }

  // Ensure hashtags have # prefix
  const hashtags = parsed.hashtags.map((h: string) =>
    h.startsWith('#') ? h : `#${h}`
  );

  // Append brand hashtags (deduped)
  const allHashtags = [...new Set([...brandHashtags, ...hashtags])];

  // Truncate caption if needed
  const caption = parsed.caption.slice(0, maxLength);

  return {
    caption,
    hashtags: allHashtags,
  };
}
