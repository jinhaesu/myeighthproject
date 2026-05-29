import Anthropic from '@anthropic-ai/sdk';
import PptxGenJS from 'pptxgenjs';
import type { PptStructure, PptSlide, PptPreset } from '@/types';

// ─── Design Tokens ──────────────────────────────────────────────────────────

const COLORS = {
  primary: '111827',
  secondary: '1a5c2e',
  accent: '22c55e',
  textDark: '333333',
  textLight: 'FFFFFF',
  bgLight: 'F9FAFB',
  bgCard: 'F3F4F6',
  headerBg: '111827',
};

const FONT = '맑은 고딕';

// ─── Preset Prompts ─────────────────────────────────────────────────────────

const PRESET_PROMPTS: Record<PptPreset, string> = {
  business_report: '이 글을 경영진 보고용 PPT로 구조화하세요. 핵심 수치를 강조하고, 전기 대비 증감을 명확히 보여주세요.',
  proposal: '이 글을 거래처 제안용 PPT로 구조화하세요. 당사의 강점과 협력 시 기대효과를 중심으로 구성하세요.',
  training: '이 글을 사내 교육용 PPT로 구조화하세요. 단계별로 쉽게 따라할 수 있도록 구성하세요.',
  business_plan: '이 글을 사업계획 발표용 PPT로 구조화하세요. 시장 분석 → 전략 → 실행 계획 → 재무 계획 순서로 논리적으로 구성하세요.',
  custom: '',
};

// ─── AI Structurizer ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 비즈니스 PPT 슬라이드 구조화 전문가입니다.
입력된 글을 분석하여 PPT 슬라이드 구조를 JSON으로 출력합니다.

반드시 아래 JSON 형식만 출력하세요. 설명이나 마크다운 코드블록 없이 순수 JSON만 출력합니다.

{
  "title": "PPT 전체 제목",
  "slides": [
    { "layout": "레이아웃타입", "title": "슬라이드 제목", ... }
  ]
}

[레이아웃 종류와 필드]
1. title_slide: {"layout":"title_slide","title":"대제목","subtitle":"부제목"}
2. section_header: {"layout":"section_header","title":"섹션명"}
3. content: {"layout":"content","title":"제목","bullets":["항목1","항목2",...]}
4. two_column: {"layout":"two_column","title":"제목","left_title":"왼쪽제목","left_bullets":[...],"right_title":"오른쪽제목","right_bullets":[...]}
5. key_number: {"layout":"key_number","title":"제목","numbers":[{"value":"32억","label":"온라인 매출"},...]}, 최대 4개
6. table: {"layout":"table","title":"제목","headers":["열1","열2"],"rows":[["값1","값2"],...]}
7. closing: {"layout":"closing","title":"감사합니다","subtitle":"추가문구"}

[규칙]
- 첫 슬라이드는 반드시 title_slide, 마지막은 closing
- 슬라이드당 핵심 메시지 1개, 불릿 3~5개
- 제목은 15자 이내
- 숫자 데이터는 key_number, 비교는 two_column 적극 활용
- 전체 슬라이드 5~15장`;

export async function structurize(text: string, preset: PptPreset, customInstruction?: string): Promise<PptStructure> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic({ apiKey });

  const presetPrompt = preset === 'custom' ? (customInstruction || '') : PRESET_PROMPTS[preset];
  const userMessage = presetPrompt
    ? `[PPT 스타일 지시]\n${presetPrompt}\n\n[원문]\n${text}`
    : `[원문]\n${text}`;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text in Claude response');

  let raw = textBlock.text.trim();
  if (raw.startsWith('```')) {
    const lines = raw.split('\n');
    raw = lines.slice(1, -1).join('\n');
  }

  return JSON.parse(raw) as PptStructure;
}

// ─── PPT Builder ────────────────────────────────────────────────────────────

function addTitleSlide(pptx: PptxGenJS, slide: PptSlide) {
  const s = pptx.addSlide();
  s.background = { color: COLORS.headerBg };

  // Accent bar
  s.addShape('rect' as PptxGenJS.ShapeType, {
    x: 0.8, y: 1.8, w: 0.08, h: 2.2,
    fill: { color: COLORS.accent },
    line: { color: COLORS.accent, width: 0 },
  });

  s.addText(slide.title, {
    x: 1.2, y: 1.8, w: 10, h: 1.0,
    fontSize: 32, fontFace: FONT, bold: true,
    color: COLORS.textLight,
  });

  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 1.2, y: 3.2, w: 10, h: 0.6,
      fontSize: 16, fontFace: FONT,
      color: 'B4C8DC',
    });
  }

  s.addText('조인앤조인', {
    x: 1.2, y: 4.6, w: 10, h: 0.4,
    fontSize: 12, fontFace: FONT,
    color: '8CAAC8',
  });
}

function addSectionHeader(pptx: PptxGenJS, slide: PptSlide) {
  const s = pptx.addSlide();
  s.background = { color: '1a5c2e' };

  s.addText(slide.title, {
    x: 1.5, y: 2.5, w: 10, h: 1.0,
    fontSize: 28, fontFace: FONT, bold: true,
    color: COLORS.textLight, align: 'center',
  });

  addBottomBar(s);
}

function addContentSlide(pptx: PptxGenJS, slide: PptSlide) {
  const s = pptx.addSlide();

  // Header bar
  s.addShape('rect' as PptxGenJS.ShapeType, {
    x: 0, y: 0, w: '100%', h: 1.1,
    fill: { color: COLORS.headerBg },
    line: { color: COLORS.headerBg, width: 0 },
  });

  s.addText(slide.title, {
    x: 0.8, y: 0.2, w: 10, h: 0.7,
    fontSize: 22, fontFace: FONT, bold: true,
    color: COLORS.textLight,
  });

  // Accent bar
  s.addShape('rect' as PptxGenJS.ShapeType, {
    x: 0.8, y: 1.4, w: 0.06, h: 0.45,
    fill: { color: COLORS.accent },
    line: { color: COLORS.accent, width: 0 },
  });

  // Bullets
  const bullets = (slide.bullets || []).map((b) => ({
    text: `•  ${b}`,
    options: { fontSize: 15, fontFace: FONT, color: COLORS.textDark, breakLine: true, lineSpacingMultiple: 1.5 },
  }));

  if (bullets.length > 0) {
    s.addText(bullets as PptxGenJS.TextProps[], {
      x: 1.1, y: 1.35, w: 10.5, h: 4.5,
      valign: 'top',
    });
  }

  addBottomBar(s);
}

function addTwoColumnSlide(pptx: PptxGenJS, slide: PptSlide) {
  const s = pptx.addSlide();

  // Header
  s.addShape('rect' as PptxGenJS.ShapeType, {
    x: 0, y: 0, w: '100%', h: 1.1,
    fill: { color: COLORS.headerBg },
    line: { color: COLORS.headerBg, width: 0 },
  });

  s.addText(slide.title, {
    x: 0.8, y: 0.2, w: 10, h: 0.7,
    fontSize: 22, fontFace: FONT, bold: true,
    color: COLORS.textLight,
  });

  // Left card
  s.addShape('roundRect' as PptxGenJS.ShapeType, {
    x: 0.6, y: 1.4, w: 5.4, h: 4.5,
    fill: { color: COLORS.bgCard },
    line: { color: COLORS.bgCard, width: 0 },
    rectRadius: 0.15,
  });

  if (slide.left_title) {
    s.addText(slide.left_title, {
      x: 0.9, y: 1.6, w: 4.8, h: 0.5,
      fontSize: 16, fontFace: FONT, bold: true, color: COLORS.secondary,
    });
  }

  const leftBullets = (slide.left_bullets || []).map((b) => ({
    text: `•  ${b}`,
    options: { fontSize: 13, fontFace: FONT, color: COLORS.textDark, breakLine: true, lineSpacingMultiple: 1.4 },
  }));
  if (leftBullets.length > 0) {
    s.addText(leftBullets as PptxGenJS.TextProps[], { x: 1.0, y: 2.2, w: 4.6, h: 3.2, valign: 'top' });
  }

  // Right card
  s.addShape('roundRect' as PptxGenJS.ShapeType, {
    x: 6.4, y: 1.4, w: 5.4, h: 4.5,
    fill: { color: COLORS.bgCard },
    line: { color: COLORS.bgCard, width: 0 },
    rectRadius: 0.15,
  });

  if (slide.right_title) {
    s.addText(slide.right_title, {
      x: 6.7, y: 1.6, w: 4.8, h: 0.5,
      fontSize: 16, fontFace: FONT, bold: true, color: COLORS.secondary,
    });
  }

  const rightBullets = (slide.right_bullets || []).map((b) => ({
    text: `•  ${b}`,
    options: { fontSize: 13, fontFace: FONT, color: COLORS.textDark, breakLine: true, lineSpacingMultiple: 1.4 },
  }));
  if (rightBullets.length > 0) {
    s.addText(rightBullets as PptxGenJS.TextProps[], { x: 6.8, y: 2.2, w: 4.6, h: 3.2, valign: 'top' });
  }

  addBottomBar(s);
}

function addKeyNumberSlide(pptx: PptxGenJS, slide: PptSlide) {
  const s = pptx.addSlide();

  // Header
  s.addShape('rect' as PptxGenJS.ShapeType, {
    x: 0, y: 0, w: '100%', h: 1.1,
    fill: { color: COLORS.headerBg },
    line: { color: COLORS.headerBg, width: 0 },
  });

  s.addText(slide.title, {
    x: 0.8, y: 0.2, w: 10, h: 0.7,
    fontSize: 22, fontFace: FONT, bold: true,
    color: COLORS.textLight,
  });

  const nums = (slide.numbers || []).slice(0, 4);
  const count = nums.length;
  if (count === 0) { addBottomBar(s); return; }

  const cardW = Math.min(2.8, (11 - 0.4 * (count - 1)) / count);
  const totalW = cardW * count + 0.4 * (count - 1);
  const startX = (13.333 - totalW) / 2;

  nums.forEach((num, i) => {
    const x = startX + i * (cardW + 0.4);

    s.addShape('roundRect' as PptxGenJS.ShapeType, {
      x, y: 2.0, w: cardW, h: 3.2,
      fill: { color: COLORS.bgCard },
      line: { color: COLORS.bgCard, width: 0 },
      rectRadius: 0.15,
    });

    s.addText(num.value, {
      x: x + 0.2, y: 2.4, w: cardW - 0.4, h: 1.0,
      fontSize: 32, fontFace: FONT, bold: true,
      color: COLORS.accent, align: 'center',
    });

    s.addText(num.label, {
      x: x + 0.2, y: 3.6, w: cardW - 0.4, h: 0.6,
      fontSize: 13, fontFace: FONT,
      color: COLORS.textDark, align: 'center',
    });
  });

  addBottomBar(s);
}

function addTableSlide(pptx: PptxGenJS, slide: PptSlide) {
  const s = pptx.addSlide();

  // Header
  s.addShape('rect' as PptxGenJS.ShapeType, {
    x: 0, y: 0, w: '100%', h: 1.1,
    fill: { color: COLORS.headerBg },
    line: { color: COLORS.headerBg, width: 0 },
  });

  s.addText(slide.title, {
    x: 0.8, y: 0.2, w: 10, h: 0.7,
    fontSize: 22, fontFace: FONT, bold: true,
    color: COLORS.textLight,
  });

  const headers = slide.headers || [];
  const dataRows = slide.rows || [];
  if (headers.length === 0) { addBottomBar(s); return; }

  const tableRows: PptxGenJS.TableRow[] = [];

  // Header row
  tableRows.push(headers.map((h) => ({
    text: h,
    options: {
      fill: { color: COLORS.headerBg },
      color: COLORS.textLight,
      fontSize: 11, fontFace: FONT, bold: true,
      align: 'center' as PptxGenJS.HAlign,
      border: { type: 'solid' as const, pt: 0.5, color: '374151' },
    },
  })));

  // Data rows
  dataRows.forEach((row, i) => {
    tableRows.push(row.map((val) => ({
      text: val,
      options: {
        fill: { color: i % 2 === 0 ? 'F9FAFB' : COLORS.textLight },
        fontSize: 10, fontFace: FONT,
        color: COLORS.textDark,
        align: 'center' as PptxGenJS.HAlign,
        border: { type: 'solid' as const, pt: 0.5, color: 'E5E7EB' },
      },
    })));
  });

  const tableW = Math.min(11, headers.length * 2.2);
  const tableX = (13.333 - tableW) / 2;

  s.addTable(tableRows, {
    x: tableX, y: 1.4,
    w: tableW,
    colW: tableW / headers.length,
    rowH: 0.45,
  });

  addBottomBar(s);
}

function addClosingSlide(pptx: PptxGenJS, slide: PptSlide) {
  const s = pptx.addSlide();
  s.background = { color: COLORS.headerBg };

  s.addText(slide.title || '감사합니다', {
    x: 1, y: 2.2, w: 11.3, h: 1.0,
    fontSize: 36, fontFace: FONT, bold: true,
    color: COLORS.textLight, align: 'center',
  });

  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 1, y: 3.6, w: 11.3, h: 0.6,
      fontSize: 14, fontFace: FONT,
      color: 'B4C8DC', align: 'center',
    });
  }

  s.addText('조인앤조인', {
    x: 1, y: 4.8, w: 11.3, h: 0.4,
    fontSize: 12, fontFace: FONT,
    color: '8CAAC8', align: 'center',
  });
}

function addBottomBar(s: PptxGenJS.Slide) {
  s.addShape('rect' as PptxGenJS.ShapeType, {
    x: 0, y: 6.9, w: '100%', h: 0.35,
    fill: { color: COLORS.headerBg },
    line: { color: COLORS.headerBg, width: 0 },
  });

  s.addText('조인앤조인', {
    x: 0.5, y: 6.9, w: 3, h: 0.35,
    fontSize: 8, fontFace: FONT, color: '9CA3AF',
  });
}

const BUILDERS: Record<PptSlide['layout'], (pptx: PptxGenJS, slide: PptSlide) => void> = {
  title_slide: addTitleSlide,
  section_header: addSectionHeader,
  content: addContentSlide,
  two_column: addTwoColumnSlide,
  key_number: addKeyNumberSlide,
  table: addTableSlide,
  closing: addClosingSlide,
};

export async function buildPptBuffer(structure: PptStructure): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = '조인앤조인';
  pptx.title = structure.title;

  for (const slide of structure.slides) {
    const builder = BUILDERS[slide.layout] || addContentSlide;
    builder(pptx, slide);
  }

  // Write to buffer
  const output = await pptx.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}
