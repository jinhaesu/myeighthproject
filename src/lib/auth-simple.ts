import { Resend } from 'resend';
import { SignJWT, jwtVerify } from 'jose';
import { run, queryOne } from './db';

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

// Ensure auth_codes table exists
function ensureAuthTable() {
  try {
    run(`CREATE TABLE IF NOT EXISTS auth_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
  } catch { /* table already exists */ }
}

export async function sendVerificationCode(
  email: string
): Promise<boolean> {
  const normalised = email.toLowerCase().trim();
  const allowed = getAllowedEmails();
  if (allowed.length > 0 && !allowed.includes(normalised)) {
    return false;
  }

  ensureAuthTable();

  const code = Math.random().toString().slice(2, 8); // 6 digits
  const expiresAt = Date.now() + 10 * 60 * 1000;

  // Upsert code in DB (works across instances)
  run(`DELETE FROM auth_codes WHERE email = ?`, [normalised]);
  run(`INSERT INTO auth_codes (email, code, expires_at) VALUES (?, ?, ?)`, [normalised, code, expiresAt]);

  await getResend().emails.send({
    from: process.env.AUTH_EMAIL_FROM ?? 'noreply@joinandjoin.com',
    to: normalised,
    subject: 'Nuldam Content Studio - Login Code',
    html: `<p>Your login code: <strong>${code}</strong></p><p>Valid for 10 minutes.</p>`,
  });

  return true;
}

export function verifyCode(email: string, code: string): boolean {
  ensureAuthTable();
  const normalised = email.toLowerCase().trim();
  const stored = queryOne<{ code: string; expires_at: number }>(
    `SELECT code, expires_at FROM auth_codes WHERE email = ?`, [normalised]
  );
  if (!stored || stored.code !== code || Date.now() > stored.expires_at) {
    return false;
  }
  run(`DELETE FROM auth_codes WHERE email = ?`, [normalised]);
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
