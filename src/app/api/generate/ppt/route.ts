import { structurize, buildPptBuffer } from '@/lib/ppt';
import type { GeneratePptRequest, PptPreset } from '@/types';

const VALID_PRESETS: PptPreset[] = ['business_report', 'proposal', 'training', 'business_plan', 'custom'];

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body: GeneratePptRequest = await request.json();

    if (!body.text?.trim()) {
      return Response.json(
        { success: false, error: 'text is required' },
        { status: 400 }
      );
    }

    if (!body.preset || !VALID_PRESETS.includes(body.preset)) {
      return Response.json(
        { success: false, error: `preset must be one of: ${VALID_PRESETS.join(', ')}` },
        { status: 400 }
      );
    }

    // Step 1: AI structurize
    const structure = await structurize(body.text, body.preset, body.custom_instruction);

    // Step 2: Build PPT
    const pptBuffer = await buildPptBuffer(structure);

    const durationMs = Date.now() - startTime;

    // Return the file
    const filename = encodeURIComponent(`${structure.title}.pptx`);
    return new Response(new Uint8Array(pptBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'X-PPT-Title': encodeURIComponent(structure.title),
        'X-PPT-Slides': String(structure.slides.length),
        'X-PPT-Duration-Ms': String(durationMs),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

// Structurize-only endpoint (returns JSON structure without building PPT)
export async function PUT(request: Request) {
  try {
    const body: GeneratePptRequest = await request.json();

    if (!body.text?.trim()) {
      return Response.json({ success: false, error: 'text is required' }, { status: 400 });
    }

    const structure = await structurize(
      body.text,
      body.preset || 'business_report',
      body.custom_instruction
    );

    return Response.json({ success: true, data: structure });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
