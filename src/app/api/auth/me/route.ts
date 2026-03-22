import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth-simple';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nuldam-token')?.value;

  if (!token) {
    return Response.json({ user: null }, { status: 401 });
  }

  const user = await verifyToken(token);
  if (!user) {
    return Response.json({ user: null }, { status: 401 });
  }

  return Response.json({ user });
}
