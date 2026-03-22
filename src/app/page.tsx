'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { apiGet } from '@/lib/api';
import {
  formatDate,
  contentTypeLabel,
  statusLabel,
  statusColor,
} from '@/lib/utils';
import type { Content, PaginatedResponse } from '@/types';

export default function DashboardPage() {
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiGet<Content[]>('/api/contents?limit=100');
        const data = (res as PaginatedResponse<Content>).data || [];
        setContents(data);
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalCount = contents.length;
  const thisWeekCount = contents.filter((c) => {
    const created = new Date(c.created_at);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return created >= weekAgo;
  }).length;
  const publishedCount = contents.filter((c) => c.status === 'published').length;
  const pendingCount = contents.filter((c) => c.status !== 'published').length;

  const recentContents = contents.slice(0, 5);

  const today = new Date();
  const dateStr = today.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const stats = [
    {
      label: '총 콘텐츠',
      value: totalCount,
      change: '+12%',
      changeType: 'up' as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-500',
    },
    {
      label: '이번 주 생성',
      value: thisWeekCount,
      change: '+8%',
      changeType: 'up' as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      bgColor: 'bg-amber-50',
      iconColor: 'text-amber-500',
    },
    {
      label: '배포 완료',
      value: publishedCount,
      change: '+24%',
      changeType: 'up' as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bgColor: 'bg-green-50',
      iconColor: 'text-green-500',
    },
    {
      label: '대기 중',
      value: pendingCount,
      change: '-5%',
      changeType: 'down' as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bgColor: 'bg-purple-50',
      iconColor: 'text-purple-500',
    },
  ];

  const quickActions = [
    {
      title: '건강정보',
      description: '건강 관련 정보 콘텐츠를 생성합니다',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
      color: 'text-rose-500',
      bgColor: 'bg-rose-50',
    },
    {
      title: '레시피',
      description: '요리 레시피 콘텐츠를 생성합니다',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      ),
      color: 'text-orange-500',
      bgColor: 'bg-orange-50',
    },
    {
      title: '영양팁',
      description: '영양 관련 팁 콘텐츠를 생성합니다',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#22c55e] rounded-full animate-spin" />
          <p className="text-sm text-gray-400">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold text-[#111827]">
          안녕하세요, 진해수님
        </h2>
        <p className="text-sm text-[#6b7280] mt-1">{dateStr}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="flex items-start justify-between hover:shadow-md"
          >
            <div>
              <p className="text-sm text-[#6b7280] font-medium">{stat.label}</p>
              <p className="text-3xl font-bold text-[#111827] mt-1">{stat.value}</p>
              <p className={`text-xs mt-2 font-medium ${stat.changeType === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                {stat.change} <span className="text-[#6b7280] font-normal">전주 대비</span>
              </p>
            </div>
            <div className={`w-10 h-10 ${stat.bgColor} rounded-xl flex items-center justify-center ${stat.iconColor}`}>
              {stat.icon}
            </div>
          </Card>
        ))}
      </div>

      {/* Recent Contents */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#111827]">최근 콘텐츠</h3>
          <Link href="/contents">
            <Button variant="ghost" size="sm">
              전체 보기
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </Link>
        </div>

        <Card className="p-0 overflow-hidden">
          {recentContents.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-[#111827] font-medium mb-1">아직 생성된 콘텐츠가 없습니다</p>
              <p className="text-sm text-[#6b7280]">새 콘텐츠를 만들어보세요!</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3.5 text-xs font-medium text-[#6b7280] uppercase tracking-wider">제목</th>
                  <th className="text-left px-6 py-3.5 text-xs font-medium text-[#6b7280] uppercase tracking-wider">유형</th>
                  <th className="text-left px-6 py-3.5 text-xs font-medium text-[#6b7280] uppercase tracking-wider">상태</th>
                  <th className="text-left px-6 py-3.5 text-xs font-medium text-[#6b7280] uppercase tracking-wider">생성일</th>
                </tr>
              </thead>
              <tbody>
                {recentContents.map((content) => (
                  <tr
                    key={content.id}
                    className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href="/contents"
                        className="text-sm font-medium text-[#111827] hover:text-[#1a5c2e] transition-colors"
                      >
                        {content.title}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">
                      {contentTypeLabel(content.content_type)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusColor(content.status)}`}
                      >
                        {statusLabel(content.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">
                      {formatDate(content.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Quick Create */}
      <div>
        <h3 className="text-lg font-semibold text-[#111827] mb-4">빠른 생성</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {quickActions.map((action) => (
            <Link key={action.title} href="/create">
              <Card className="group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className={`w-12 h-12 ${action.bgColor} rounded-xl flex items-center justify-center ${action.color} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  {action.icon}
                </div>
                <h4 className="text-base font-semibold text-[#111827] mb-1">{action.title}</h4>
                <p className="text-sm text-[#6b7280]">{action.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
