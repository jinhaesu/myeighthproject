'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { apiGet } from '@/lib/api';
import {
  contentTypeLabel,
  statusLabel,
  statusColor,
  formatDate,
  cn,
} from '@/lib/utils';
import type { Content, ContentStatus, PaginatedResponse } from '@/types';

const statusTabs: { value: ContentStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'draft', label: '초안' },
  { value: 'script_ready', label: '스크립트 완료' },
  { value: 'audio_ready', label: '음성 완료' },
  { value: 'video_ready', label: '영상 완료' },
  { value: 'published', label: '게시됨' },
];

const contentTypeFilters = [
  { value: 'all', label: '전체 유형' },
  { value: 'health_info', label: '건강정보' },
  { value: 'recipe', label: '레시피' },
  { value: 'nutrition_tip', label: '영양팁' },
];

const languageLabel: Record<string, string> = {
  ko: '한국어',
  en: '영어',
};

export default function ContentsPage() {
  const router = useRouter();
  const [contents, setContents] = useState<Content[]>([]);
  const [filter, setFilter] = useState<ContentStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const query =
          filter === 'all'
            ? '/api/contents?limit=100'
            : `/api/contents?limit=100&status=${filter}`;
        const res = await apiGet<Content[]>(query);
        setContents((res as PaginatedResponse<Content>).data || []);
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter]);

  const filteredContents = contents.filter((c) => {
    if (typeFilter !== 'all' && c.content_type !== typeFilter) return false;
    if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[#6b7280]">총 {filteredContents.length}개의 콘텐츠</p>
        </div>
        <Link href="/create">
          <Button>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 콘텐츠
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status pills */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={cn(
                'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-200',
                filter === tab.value
                  ? 'bg-[#1a5c2e] text-white shadow-sm'
                  : 'text-[#6b7280] hover:text-[#111827] hover:bg-gray-50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 bg-white text-[#6b7280] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10"
        >
          {contentTypeFilters.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative ml-auto">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="콘텐츠 검색..."
            className="pl-9 pr-4 py-2 text-xs bg-white border border-gray-200 rounded-xl placeholder:text-gray-400 text-[#111827] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 w-52"
          />
        </div>
      </div>

      {/* Contents Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#22c55e] rounded-full animate-spin" />
          </div>
        ) : filteredContents.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-base font-medium text-[#111827] mb-2">아직 콘텐츠가 없습니다</p>
            <p className="text-sm text-[#6b7280] mb-5">
              {filter !== 'all'
                ? '선택한 상태의 콘텐츠가 없습니다.'
                : '새 콘텐츠를 생성해 보세요.'}
            </p>
            <Link href="/create">
              <Button size="lg">새 콘텐츠 만들기</Button>
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3.5 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                  제목
                </th>
                <th className="text-left px-6 py-3.5 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                  유형
                </th>
                <th className="text-left px-6 py-3.5 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                  상태
                </th>
                <th className="text-left px-6 py-3.5 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                  언어
                </th>
                <th className="text-left px-6 py-3.5 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                  예정일
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredContents.map((content) => (
                <tr
                  key={content.id}
                  onClick={() => router.push(`/contents/${content.id}`)}
                  className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 text-sm font-medium text-[#111827]">
                    {content.title}
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
                    {languageLabel[content.language] || content.language}
                  </td>
                  <td className="px-6 py-4 text-sm text-[#6b7280]">
                    {content.scheduled_date
                      ? formatDate(content.scheduled_date)
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
