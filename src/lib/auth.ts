import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';

const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? 'Nuldam <noreply@nuldam.com>',
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=1',
  },
  callbacks: {
    async signIn({ user }) {
      if (allowedEmails.length === 0) return true;
      const email = user.email?.toLowerCase();
      return !!email && allowedEmails.includes(email);
    },
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  trustHost: true,
});
