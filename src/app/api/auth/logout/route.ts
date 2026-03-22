export async function POST() {
  const response = Response.json({ ok: true });
  response.headers.set(
    'Set-Cookie',
    'nuldam-token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  );
  return response;
}
