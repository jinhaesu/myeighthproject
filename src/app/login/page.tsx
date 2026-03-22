'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const searchParams = useSearchParams();
  const isVerify = searchParams.get('verify') === '1';
  const error = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(isVerify);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await signIn('resend', {
        email: email.trim(),
        callbackUrl: '/',
      });
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a5c2e] to-[#111827] px-4">
      <div className="w-full max-w-md">
        <div className="bg-white/[0.07] backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-[#22c55e] rounded-2xl flex items-center justify-center text-2xl font-bold text-white mb-4 shadow-lg shadow-[#22c55e]/20">
              N
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              널담
            </h1>
            <p className="text-sm text-gray-400 mt-1">Content Studio</p>
          </div>

          {sent ? (
            /* Verification sent message */
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#22c55e]/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-[#22c55e]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">
                이메일을 확인해주세요
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                로그인 링크가 발송되었습니다.
                <br />
                이메일에서 링크를 클릭하면 로그인됩니다.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-6 text-sm text-[#22c55e] hover:text-[#22c55e]/80 transition-colors"
              >
                다른 이메일로 로그인
              </button>
            </div>
          ) : (
            /* Email input form */
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm text-center">
                  {error === 'AccessDenied'
                    ? '허용되지 않은 이메일입니다.'
                    : '로그인 중 오류가 발생했습니다.'}
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  이메일
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#22c55e]/40 focus:border-[#22c55e]/40 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-3 rounded-xl bg-[#22c55e] hover:bg-[#22c55e]/90 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-[#22c55e]/20 hover:shadow-[#22c55e]/30"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    발송 중...
                  </span>
                ) : (
                  '로그인 링크 발송'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          조인앤조인 &middot; 널담 Content Studio
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a5c2e] to-[#111827]">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
