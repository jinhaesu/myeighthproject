'use client';

import { useState } from 'react';

type Step = 'email' | 'code';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(
          data.error === 'Not allowed'
            ? '허용되지 않은 이메일입니다.'
            : '코드 발송에 실패했습니다.'
        );
        setLoading(false);
        return;
      }

      setStep('code');
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });

      if (!res.ok) {
        setError('인증 코드가 올바르지 않거나 만료되었습니다.');
        setLoading(false);
        return;
      }

      // Cookie is set by the server, redirect to home
      window.location.href = '/';
    } catch {
      setError('네트워크 오류가 발생했습니다.');
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

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleSendCode} className="space-y-5">
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
                  '인증 코드 발송'
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              {/* Confirmation message */}
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
                <p className="text-sm text-gray-400 leading-relaxed">
                  <span className="text-white font-medium">{email}</span>
                  으로
                  <br />
                  인증 코드가 발송되었습니다.
                </p>
              </div>

              <form onSubmit={handleVerifyCode} className="space-y-5">
                <div>
                  <label
                    htmlFor="code"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    인증 코드 (6자리)
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="000000"
                    required
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-gray-500 text-sm text-center tracking-[0.3em] font-mono text-lg focus:outline-none focus:ring-2 focus:ring-[#22c55e]/40 focus:border-[#22c55e]/40 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.trim().length < 6}
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
                      확인 중...
                    </span>
                  ) : (
                    '로그인'
                  )}
                </button>
              </form>

              <button
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError('');
                }}
                className="w-full text-sm text-[#22c55e] hover:text-[#22c55e]/80 transition-colors text-center"
              >
                다른 이메일로 로그인
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          조인앤조인 &middot; 널담 Content Studio
        </p>
      </div>
    </div>
  );
}
