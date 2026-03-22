'use client';

import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/': '대시보드',
  '/calendar': '캘린더',
  '/contents': '콘텐츠 관리',
  '/create': '새 콘텐츠 생성',
  '/publish': '배포 관리',
  '/settings': '설정',
};

export default function Header() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || '널담';

  return (
    <header className="h-16 bg-white/80 backdrop-blur-sm border-b border-gray-100 flex items-center justify-between px-8 shrink-0 sticky top-0 z-30">
      <h1 className="text-2xl font-bold text-[#111827]">{title}</h1>
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="검색..."
            disabled
            className="w-56 pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder:text-gray-400 text-gray-500 cursor-not-allowed"
          />
        </div>
        {/* Notification Bell */}
        <button className="relative p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#22c55e] rounded-full" />
        </button>
      </div>
    </header>
  );
}
