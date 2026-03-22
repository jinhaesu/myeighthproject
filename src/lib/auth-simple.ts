import { Resend } from 'resend';
import { SignJWT, jwtVerify } from 'jose';

// Lazy init to avoid build-time errors when env vars are not set
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.AUTH_RESEND_KEY || '');
  }
  return _resend;
}

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || 'fallback-secret-change-me');
}

function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

// In-memory verification code store
const codes = new Map<string, { code: string; expires: number }>();

export async function sendVerificationCode(
  email: string
): Promise<boolean> {
  const normalised = email.toLowerCase().trim();
  const allowed = getAllowedEmails();
  if (allowed.length > 0 && !allowed.includes(normalised)) {
    return false;
  }

  const code = Math.random().toString().slice(2, 8); // 6 digits
  codes.set(normalised, { code, expires: Date.now() + 10 * 60 * 1000 });

  await getResend().emails.send({
    from: process.env.AUTH_EMAIL_FROM ?? 'onboarding@resend.dev',
    to: normalised,
    subject: 'Nuldam Content Studio - Login Code',
    html: `<p>Your login code: <strong>${code}</strong></p><p>Valid for 10 minutes.</p>`,
  });

  return true;
}

export function verifyCode(email: string, code: string): boolean {
  const stored = codes.get(email.toLowerCase().trim());
  if (!stored || stored.code !== code || Date.now() > stored.expires) {
    return false;
  }
  codes.delete(email.toLowerCase().trim());
  return true;
}

export async function createToken(email: string): Promise<string> {
  return new SignJWT({ email: email.toLowerCase().trim() })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifyToken(
  token: string
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { email: payload.email as string };
  } catch {
    return null;
  }
}
