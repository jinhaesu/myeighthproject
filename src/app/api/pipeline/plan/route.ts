import Anthropic from '@anthropic-ai/sdk';
import { run } from '@/lib/db';
import type {
  PlanRequest,
  PlanItem,
  ContentType,
  ApiResponse,
} from '@/types';

// ─── POST /api/pipeline/plan ────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body: PlanRequest = await request.json();

    // Validate
    if (!body.month || !body.contents_per_week || !body.content_types?.length) {
      return Response.json(
        { success: false, error: 'month, contents_per_week, and content_types are required' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Validate month format (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(body.month)) {
      return Response.json(
        { success: false, error: 'month must be in YYYY-MM format' } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { success: false, error: 'ANTHROPIC_API_KEY not configured' } satisfies ApiResponse,
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const contentTypeLabels: Record<ContentType, string> = {
      health_info: '건강정보',
      recipe: '레시피',
      nutrition_tip: '영양팁',
      product_ad: '제품 광고',
      brand_ad: '브랜드 광고',
    };

    const typesKo = body.content_types.map((t) => contentTypeLabels[t] || t).join(', ');
    const brandKeywords = body.brand_keywords?.join(', ') || '널담, 건강식품, K-Food';
    const avoidTopics = body.avoid_topics?.length
      ? `\n피해야 할 주제: ${body.avoid_topics.join(', ')}`
      : '';

    // Calculate total contents for the month
    const [yearStr, monthStr] = body.month.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const weeksInMonth = Math.ceil(daysInMonth / 7);
    const totalContents = weeksInMonth * body.contents_per_week;

    const systemPrompt = `당신은 "널담" 건강식품 브랜드의 콘텐츠 전략가입니다.
월간 콘텐츠 캘린더를 기획해주세요.

브랜드 키워드: ${brandKeywords}
사용할 콘텐츠 유형: ${typesKo}
${avoidTopics}

규칙:
- 주당 ${body.contents_per_week}개 콘텐츠 (주말 제외, 평일에 배치)
- 콘텐츠 유형을 골고루 분배
- 계절/시기에 맞는 주제 (${year}년 ${month}월)
- 트렌디하면서도 검증된 건강 정보
- 각 주제는 구체적이고 명확해야 함
- 시리즈물도 가능 (예: "장 건강 시리즈 1/3")

반드시 아래 JSON 형식으로만 응답:
{
  "plan": [
    {
      "date": "YYYY-MM-DD",
      "content_type": "health_info|recipe|nutrition_tip",
      "topic": "주제",
      "description": "간략 설명 (1-2문장)"
    }
  ]
}`;

    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${year}년 ${month}월 콘텐츠 캘린더를 만들어주세요. 총 ${totalContents}개의 콘텐츠를 기획해주세요.`,
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

    let parsed: { plan: PlanItem[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error(`Failed to parse plan response as JSON: ${rawText.slice(0, 200)}`);
    }

    if (!Array.isArray(parsed.plan) || parsed.plan.length === 0) {
      throw new Error('Plan response missing or empty plan array');
    }

    // Save each plan item to calendar_events
    const savedEvents: Array<PlanItem & { event_id: number }> = [];

    for (const item of parsed.plan) {
      const result = run(
        `INSERT INTO calendar_events (title, description, event_date, event_type)
         VALUES (?, ?, ?, ?)`,
        [
          item.topic,
          item.description || null,
          item.date,
          item.content_type,
        ]
      );
      savedEvents.push({
        ...item,
        event_id: Number(result.lastInsertRowid),
      });
    }

    return Response.json({
      success: true,
      data: {
        month: body.month,
        total_items: savedEvents.length,
        items: savedEvents,
      },
    } satisfies ApiResponse, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
