import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

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
        <Sidebar />
        <div className="ml-[260px] min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
