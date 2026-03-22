import { sendVerificationCode } from '@/lib/auth-simple';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return Response.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const ok = await sendVerificationCode(email);
    if (!ok) {
      return Response.json(
        { error: 'Not allowed' },
        { status: 403 }
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('send-code error:', err);
    return Response.json(
      { error: 'Failed to send code' },
      { status: 500 }
    );
  }
}
