import type { ContentType, Language, VideoLength, AdConfig } from '@/types';

// ─── Brand Voice ────────────────────────────────────────────────────────────

const BRAND_VOICE = `
당신은 "널담"이라는 건강식품 브랜드의 콘텐츠 크리에이터입니다.
널담의 톤앤매너:
- 친근하고 따뜻한 말투 (반말 아닌 존댓말, 하지만 딱딱하지 않게)
- 신뢰감 있는 전문 정보 전달
- 시청자가 "오, 이거 좋다!" 하고 느낄 수 있도록
- 한국 식품/건강 트렌드에 맞는 내용
`.trim();

// ─── Ad Production Principles (옵시디언 노트 기반) ──────────────────────────

const AD_PRINCIPLES = `
[광고 제작 핵심 원칙]
1. 사람보다 **제품**을 중심에 둔다.
2. 영상은 15초라도 **샷 단위**로 만든다.
3. 패키지/질감/색감은 **먼저 이미지로 고정**한다.
4. 숏폼 광고는 **1.5~3초 컷** 위주로 자른다.
5. 실사와 AI를 섞는 것이 가장 현실적이다.
6. 한 편의 완성작보다 **테스트 가능한 에셋 묶음**을 만드는 데 초점을 둔다.
7. 긴 컷보다 짧은 컷이 안전하다.
8. 사람 얼굴 비중을 줄인다.

[의사결정 원칙]
- 완전 AI보다 실사+AI 혼합을 우선 검토한다.
- 프롬프트 직접 작성보다 구조화된 입력과 템플릿 재사용을 우선한다.
`.trim();

// ─── Shot Templates (프롬프트 템플릿 세트) ──────────────────────────────────

const SHOT_PROMPT_TEMPLATES = `
[비주얼 프롬프트 템플릿 — 각 샷에 맞게 활용]

제품 클로즈업:
Close-up premium commercial shot of [PRODUCT] on a clean tabletop, soft studio lighting, shallow depth of field, subtle camera push-in, realistic packaging, realistic food texture, premium consumer brand ad, no warped label, no distorted packaging, no extra objects, clean background.

질감/단면 매크로:
Macro commercial shot of [PRODUCT] being torn open to reveal texture, natural crumbs and soft interior, cinematic food lighting, high realism, appetizing texture, shallow depth of field, minimal hand presence, premium bakery ad look, no deformation.

라이프스타일:
Lifestyle commercial shot of a person enjoying [PRODUCT] with coffee in a bright morning kitchen, soft natural light, clean premium interior, subtle handheld realism, calm healthy routine mood, face not fully front-facing, realistic motion, consumer brand ad style.

효익 설명:
Premium motion graphic style commercial frame for [BENEFIT], clean background, product floating with subtle motion, minimal typography area, modern consumer brand aesthetic, realistic lighting, suitable for overlay text.

엔드카드:
Premium end card for [BRAND] featuring [PRODUCT], clean centered packaging, soft gradient background, elegant lighting, space for logo and CTA, premium Korean consumer brand ad style, minimalistic and polished.
`.trim();

// ─── Video Length Shot Structures ──────────────────────────────────────────

const SHOT_STRUCTURES: Record<VideoLength, string> = {
  6: `[6초 범퍼 구조]
- 샷 1: 제품 클로즈업 (2초) — 강렬한 첫 인상
- 샷 2: 핵심 효익 한 줄 + 엔드카드 (4초) — CTA

총 2개 샷, 매우 임팩트 있게. 대사는 한 문장 이하.`,

  15: `[15초 숏폼 광고 구조]
- 샷 1: 제품 클로즈업 (2초) — 훅, 첫 2초에 제품이 보여야 함
- 샷 2: 질감/단면 매크로 (3초) — 식감/맛 전달
- 샷 3: 라이프스타일 (3초) — 사용 상황
- 샷 4: 효익 설명 (3초) — 고단백/저당 등 텍스트 오버레이
- 샷 5: 엔드카드 (4초) — 제품 + 로고 + CTA

총 5개 샷. 내레이션은 2-3문장 이내. 임팩트 있고 심플하게.`,

  30: `[30초 광고 구조]
- 샷 1: 훅 — 질문 또는 놀라운 사실 (3초)
- 샷 2: 제품 클로즈업 (3초)
- 샷 3: 질감/단면 (4초)
- 샷 4: 라이프스타일 (4초)
- 샷 5: 효익 설명 1 (4초)
- 샷 6: 효익 설명 2 (4초)
- 샷 7: 사용 장면 (4초)
- 샷 8: 엔드카드 + CTA (4초)

총 8개 샷. 내레이션은 핵심만. 각 샷 3-4초를 넘지 않도록.`,

  60: `[60초 콘텐츠 구조]
- 섹션 1 — 후킹 (5초): 시청자 관심을 끄는 질문이나 놀라운 사실
- 섹션 2 — 핵심 정보 (40초): 2-3가지 핵심 포인트, 각 포인트별 비주얼 전환
- 섹션 3 — 실천 팁 (10초): 바로 적용 가능한 팁
- 섹션 4 — 마무리 (5초): 브랜드 멘트 + CTA

각 섹션 안에서도 2-3초 단위 컷 전환 권장.`,
};

// ─── Content Type Prompts (기존 + 광고) ─────────────────────────────────────

// ─── Visual Prompt Guidelines ─────────────────────────────────────────────

const VISUAL_PROMPT_GUIDELINES = `

중요 (반드시 지켜야 할 규칙):
- body는 순수 나레이션 텍스트만 작성하세요. [후킹], [핵심정보], (효과음) 같은 태그, 괄호, 구조 표시를 절대 포함하지 마세요. TTS가 이 텍스트를 그대로 읽습니다.
- visual_prompt는 반드시 영어로 작성하세요. DALL-E와 Kling AI가 이해할 수 있는 구체적인 영상/이미지 생성 프롬프트입니다.
  - 음식 재료가 캐릭터화되어 움직이는 애니메이션 스타일 장면
  - 또는 전문적인 푸드 포토그래피 스타일
  - 카메라 앵글(close-up, overhead, eye-level), 조명(warm, natural, studio), 분위기(cozy, vibrant, professional)를 구체적으로 묘사
  - 캐릭터나 동작이 있다면 구체적으로 묘사 (예: "garlic character wearing a cape, punching virus monsters")
  - 항상 "vertical 9:16 format"을 마지막에 포함
  - "No text overlay"를 포함
- visual_description은 한국어로 해당 장면이 시각적으로 어떻게 보여야 하는지 설명
- title은 내부 참조용이며 TTS에 읽히지 않습니다. 간결하게 섹션 역할을 표시하세요 (예: "후킹", "핵심정보1", "마무리")`.trim();

const PROMPTS: Record<ContentType, Record<Language, string>> = {
  health_info: {
    ko: `${BRAND_VOICE}

[건강 정보 콘텐츠]
주어진 건강 주제에 대해 숏폼 영상 스크립트를 작성해주세요.

구성은 지정된 영상 길이에 맞춰 제작합니다.
주의사항:
- 의학적 단정은 피하고 "~에 도움이 될 수 있어요" 식으로
- 출처가 있는 정보 위주로
- 너무 어려운 용어는 쉽게 풀어서 설명

${VISUAL_PROMPT_GUIDELINES}`,
    en: `${BRAND_VOICE}

[Health Information Content]
Write a short-form video script about the given health topic.
Match the script length to the specified video duration.

${VISUAL_PROMPT_GUIDELINES}`,
  },

  recipe: {
    ko: `${BRAND_VOICE}

[레시피 콘텐츠]
주어진 요리/레시피에 대해 숏폼 영상 스크립트를 작성해주세요.

주의사항:
- 재료는 구하기 쉬운 것 위주
- 조리 시간이 짧고 간단한 레시피
- 건강에 좋은 포인트를 자연스럽게 녹여서

${VISUAL_PROMPT_GUIDELINES}`,
    en: `${BRAND_VOICE}

[Recipe Content]
Write a short-form video script for the given recipe.

${VISUAL_PROMPT_GUIDELINES}`,
  },

  nutrition_tip: {
    ko: `${BRAND_VOICE}

[영양 팁 콘텐츠]
주어진 영양/식품 주제에 대해 숏폼 영상 스크립트를 작성해주세요.

주의사항:
- 과학적 근거가 있는 내용
- "이것만 먹으면 된다" 식의 과장 금지
- 균형 잡힌 식단의 중요성 강조

${VISUAL_PROMPT_GUIDELINES}`,
    en: `${BRAND_VOICE}

[Nutrition Tip Content]
Write a short-form video script about the given nutrition topic.

${VISUAL_PROMPT_GUIDELINES}`,
  },

  product_ad: {
    ko: `${BRAND_VOICE}

${AD_PRINCIPLES}

[제품 광고 — 퍼포먼스 광고]
제품 중심의 숏폼 퍼포먼스 광고 스크립트를 작성해주세요.
소비재 브랜드 광고 문법을 따릅니다.

핵심:
- 첫 2초에 반드시 제품이 보여야 합니다 (훅)
- 사람 얼굴 비중 최소화, 제품/패키지/질감 중심
- 각 샷은 1.5~3초 이내로 짧게
- 효익 전달은 간결한 텍스트 오버레이로
- CTA는 자연스럽게

${SHOT_PROMPT_TEMPLATES}

${VISUAL_PROMPT_GUIDELINES}`,
    en: `${BRAND_VOICE}

[Product Ad — Performance Ad]
Write a product-focused short-form performance ad script.
Follow consumer brand ad grammar.

${VISUAL_PROMPT_GUIDELINES}`,
  },

  brand_ad: {
    ko: `${BRAND_VOICE}

${AD_PRINCIPLES}

[브랜드 광고 — 라이프스타일형]
브랜드 인지도를 높이는 라이프스타일형 광고 스크립트를 작성해주세요.

핵심:
- 건강한 일상 루틴 속에 제품이 자연스럽게 등장
- AG1, Huel 같은 웰니스 브랜드의 설명형 구조 참고
- 제품+루틴 컷, 최소한의 텍스트 오버레이, 깨끗한 라이팅
- 기능성과 실용성을 동시에 전달
- 실사 + AI 혼합 스타일이 가장 자연스러움

${SHOT_PROMPT_TEMPLATES}

${VISUAL_PROMPT_GUIDELINES}`,
    en: `${BRAND_VOICE}

[Brand Ad — Lifestyle]
Write a lifestyle-focused brand awareness ad script.

${VISUAL_PROMPT_GUIDELINES}`,
  },
};

// ─── Public API ─────────────────────────────────────────────────────────────

export function getPrompt(contentType: ContentType, language: Language = 'ko'): string {
  return PROMPTS[contentType][language];
}

export function buildSystemPrompt(
  contentType: ContentType,
  language: Language = 'ko',
  videoLength: VideoLength = 60
): string {
  const base = getPrompt(contentType, language);
  const structure = SHOT_STRUCTURES[videoLength];
  return `${base}\n\n${structure}`;
}

export function buildUserPrompt(
  topic: string,
  options: {
    keywords?: string[];
    additionalInstructions?: string;
    videoLength?: VideoLength;
    adConfig?: AdConfig;
  } = {}
): string {
  const { keywords = [], additionalInstructions, videoLength = 60, adConfig } = options;

  let prompt = `주제: ${topic}`;
  prompt += `\n영상 길이: ${videoLength}초`;

  if (keywords.length > 0) {
    prompt += `\n키워드: ${keywords.join(', ')}`;
  }

  if (adConfig) {
    prompt += `\n\n[제품 정보]`;
    prompt += `\n- 제품명: ${adConfig.product_name}`;
    prompt += `\n- 카테고리: ${adConfig.category}`;
    prompt += `\n- 핵심 효익: ${adConfig.benefits.join(', ')}`;
    prompt += `\n- 타깃 고객: ${adConfig.target_audience}`;
    prompt += `\n- 브랜드 톤: ${adConfig.tone}`;
    prompt += `\n- 배포 채널: ${adConfig.channels.join(', ')}`;
    if (adConfig.constraints.length > 0) {
      prompt += `\n- 금지 요소: ${adConfig.constraints.join(', ')}`;
    }
  }

  if (additionalInstructions) {
    prompt += `\n추가 지시사항: ${additionalInstructions}`;
  }

  // Determine if this is an ad format (shot-based) or content format (section-based)
  const isAdFormat = videoLength <= 30 || (adConfig !== undefined);

  if (isAdFormat) {
    prompt += `

위 정보를 바탕으로 광고 스크립트를 작성하고, 반드시 아래 JSON 형식으로만 응답해주세요:

{
  "title": "광고 제목",
  "hooks": ["훅 문장 1", "훅 문장 2", "훅 문장 3"],
  "shot_list": [
    {
      "order": 1,
      "title": "샷 설명 (예: 제품 클로즈업)",
      "body": "이 샷의 내레이션/자막 텍스트 (짧게!)",
      "duration_seconds": 2,
      "shot_type": "product_closeup",
      "visual_prompt": "이 샷의 영상 생성용 프롬프트 (영어)"
    }
  ],
  "voiceover_script": "전체 내레이션 대본 (매우 간결하게)",
  "cta_options": ["CTA 1", "CTA 2", "CTA 3"],
  "subtitles": ["자막 텍스트 1", "자막 텍스트 2"],
  "total_duration_seconds": ${videoLength},
  "tags": ["태그1", "태그2"]
}

중요:
- shot_type은 반드시 product_closeup, texture_macro, lifestyle, benefit_frame, endcard 중 하나
- visual_prompt은 영어로, 영상 생성 AI에 바로 입력 가능한 형태로
- 내레이션/자막은 ${videoLength}초에 맞게 매우 간결하게 (${videoLength <= 15 ? '2-3문장 이내' : '핵심만'})
- 각 샷의 duration_seconds 합이 ${videoLength}초가 되어야 함`;
  } else {
    prompt += `

위 주제로 스크립트를 작성하고, 반드시 아래 JSON 형식으로만 응답해주세요:

{
  "title": "영상 제목",
  "sections": [
    {
      "order": 1,
      "title": "섹션 제목 (내부 참조용, 예: 후킹, 핵심정보1)",
      "body": "나레이션 대본 (순수 텍스트만, 태그/괄호 절대 금지)",
      "visual_prompt": "English visual prompt for DALL-E/Kling (camera angle, lighting, mood, action, characters, vertical 9:16 format, No text overlay)",
      "visual_description": "한국어 시각 연출 설명 (이 장면이 어떻게 보여야 하는지)",
      "duration_seconds": 5
    }
  ],
  "total_duration_seconds": ${videoLength},
  "tags": ["태그1", "태그2"]
}

주의: body에는 절대로 [후킹], [핵심정보] 같은 태그를 넣지 마세요. TTS가 그대로 읽습니다.`;
  }

  return prompt;
}
