import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: '널담 - Content Studio',
  description: '널담 건강 콘텐츠 자동 생성 시스템',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-[#fafafa]">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
