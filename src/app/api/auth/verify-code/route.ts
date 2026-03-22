import { verifyCode, createToken } from '@/lib/auth-simple';

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json();
    if (!email || !code) {
      return Response.json(
        { error: 'Email and code are required' },
        { status: 400 }
      );
    }

    if (!verifyCode(email, code)) {
      return Response.json(
        { error: 'Invalid or expired code' },
        { status: 401 }
      );
    }

    const token = await createToken(email);

    const response = Response.json({ ok: true });
    // Set httpOnly cookie with 7-day expiry
    const maxAge = 7 * 24 * 60 * 60;
    const secure = process.env.NODE_ENV === 'production';
    response.headers.set(
      'Set-Cookie',
      `nuldam-token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
    );

    return response;
  } catch (err) {
    console.error('verify-code error:', err);
    return Response.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}
