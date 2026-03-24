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

// ─── Workflow Step Definition ─────────────────────────────────────────────────

interface WorkflowStep {
  number: number;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

const workflowSteps: WorkflowStep[] = [
  {
    number: 1,
    title: '제품 데이터 입력',
    subtitle: 'Product Data Input',
    description: '제품명, 혜택, 타겟, 채널 설정',
    href: '/create',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    number: 2,
    title: '광고 기획 생성',
    subtitle: 'Ad Planning',
    description: '훅·CTA·샷 구성 AI 자동 기획',
    href: '/create',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    number: 3,
    title: '키 비주얼 생성',
    subtitle: 'Key Visual',
    description: '제품·질감 중심 이미지 AI 생성',
    href: '/contents',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    number: 4,
    title: '샷 단위 영상 생성',
    subtitle: 'Shot-based Video',
    description: '5~8개 샷 분해 후 영상 합성',
    href: '/contents',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    number: 5,
    title: '음성/TTS 생성',
    subtitle: 'Voice / TTS',
    description: 'ElevenLabs·Edge-TTS 나레이션',
    href: '/contents',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    number: 6,
    title: '후편집 & 배포',
    subtitle: 'Post-edit & Publish',
    description: '자막·BGM 합성 후 채널 배포',
    href: '/publish',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
    ),
  },
];

// ─── Production Tips ──────────────────────────────────────────────────────────

const productionTips = [
  {
    tip: '첫 2초에 제품을 보여주세요',
    detail: '시청자의 주의를 빠르게 사로잡으려면 오프닝에 제품이 등장해야 합니다.',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    tip: '15초 = 5개 샷으로 분해하세요',
    detail: '샷당 평균 3초로 구성하면 시각적 흐름이 자연스럽습니다.',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h8m-8 6h16" />
      </svg>
    ),
  },
  {
    tip: '사람 얼굴보다 제품/질감 중심',
    detail: '식품 광고에서 질감 클로즈업은 구매 욕구를 직접 자극합니다.',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
      </svg>
    ),
  },
  {
    tip: '실사 + AI 혼합이 가장 자연스럽습니다',
    detail: '직접 촬영한 클로즈업에 AI 생성 배경을 합성하면 완성도가 높아집니다.',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
];

// ─── Quick Actions ────────────────────────────────────────────────────────────

interface QuickAction {
  title: string;
  description: string;
  badge?: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

const quickActions: QuickAction[] = [
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
    borderColor: 'hover:border-rose-200',
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
    borderColor: 'hover:border-orange-200',
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
    borderColor: 'hover:border-emerald-200',
  },
  {
    title: '제품 광고',
    description: '패키지/질감 중심 퍼포먼스 광고',
    badge: 'NEW',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    color: 'text-[#1a5c2e]',
    bgColor: 'bg-green-50',
    borderColor: 'hover:border-green-300',
  },
  {
    title: '브랜드 광고',
    description: '라이프스타일형 브랜드 인지도 광고',
    badge: 'NEW',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    color: 'text-violet-500',
    bgColor: 'bg-violet-50',
    borderColor: 'hover:border-violet-200',
  },
];

// ─── Page Component ───────────────────────────────────────────────────────────

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
      description: '지금까지 생성된 콘텐츠 수',
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
      description: '최근 7일 내 새로 만든 콘텐츠',
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
      description: '채널에 게시된 완성 콘텐츠',
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
      description: '제작 또는 검토가 필요한 콘텐츠',
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
    <div className="space-y-10 animate-fade-in">

      {/* ── Greeting ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#111827]">
            안녕하세요, 진해수님
          </h2>
          <p className="text-sm text-[#6b7280] mt-1">{dateStr}</p>
        </div>
        <Link href="/create">
          <Button variant="primary" size="md">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 콘텐츠 만들기
          </Button>
        </Link>
      </div>

      {/* ── Workflow Guide ────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-[#111827]">AI 영상 제작 파이프라인</h3>
          <p className="text-sm text-[#6b7280] mt-0.5">
            6단계 워크플로우를 따라 제품 광고 영상을 완성하세요
          </p>
        </div>

        {/* Steps: scrollable on mobile, full-width row on lg+ */}
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-2 lg:overflow-visible lg:pb-0">
            {workflowSteps.map((step, idx) => (
              <div key={step.number} className="flex items-center gap-2 flex-shrink-0 lg:flex-1">
                <Link href={step.href} className="flex-1 min-w-[148px] lg:min-w-0">
                  <div className="group bg-white border border-gray-100 rounded-xl p-3.5 hover:border-[#22c55e] hover:shadow-md transition-all duration-200 cursor-pointer h-full">
                    {/* Step number + icon row */}
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[10px] font-bold text-[#1a5c2e] bg-green-50 rounded-full px-2 py-0.5 tracking-wide">
                        STEP {step.number}
                      </span>
                      <div className="w-7 h-7 bg-green-50 rounded-lg flex items-center justify-center text-[#1a5c2e] group-hover:bg-[#1a5c2e] group-hover:text-white transition-colors duration-200">
                        {step.icon}
                      </div>
                    </div>
                    {/* Title */}
                    <p className="text-sm font-semibold text-[#111827] leading-snug">
                      {step.title}
                    </p>
                    <p className="text-[10px] text-[#6b7280] mb-1.5">{step.subtitle}</p>
                    {/* Description */}
                    <p className="text-xs text-[#6b7280] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </Link>

                {/* Arrow connector (hidden after last step) */}
                {idx < workflowSteps.length - 1 && (
                  <div className="flex-shrink-0 text-gray-300 hidden lg:block">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats Cards ───────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-[#111827]">현황 요약</h3>
          <p className="text-sm text-[#6b7280] mt-0.5">전주 대비 콘텐츠 생산 지표</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((stat) => (
            <Card
              key={stat.label}
              className="flex items-start justify-between"
            >
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-sm font-medium text-[#6b7280]">{stat.label}</p>
                <p className="text-[11px] text-[#9ca3af] mt-0.5 leading-relaxed">{stat.description}</p>
                <p className="text-3xl font-bold text-[#111827] mt-2">{stat.value}</p>
                <p className={`text-xs mt-2 font-medium ${stat.changeType === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                  {stat.change}{' '}
                  <span className="text-[#6b7280] font-normal">전주 대비</span>
                </p>
              </div>
              <div className={`w-10 h-10 flex-shrink-0 ${stat.bgColor} rounded-xl flex items-center justify-center ${stat.iconColor}`}>
                {stat.icon}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Recent Contents ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-[#111827]">최근 콘텐츠</h3>
            <p className="text-sm text-[#6b7280] mt-0.5">가장 최근에 만든 콘텐츠 5개</p>
          </div>
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
              <p className="text-[#111827] font-semibold mb-1">아직 생성된 콘텐츠가 없습니다</p>
              <p className="text-sm text-[#6b7280] mb-5">
                위의 워크플로우 1단계부터 시작하거나,<br />
                아래 빠른 생성으로 첫 콘텐츠를 만들어보세요.
              </p>
              <Link href="/create">
                <Button variant="primary" size="sm">
                  첫 콘텐츠 만들기
                </Button>
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
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
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusColor(content.status)}`}>
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

      {/* ── Quick Create ──────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-[#111827]">빠른 생성</h3>
          <p className="text-sm text-[#6b7280] mt-0.5">
            콘텐츠 유형을 선택하면 AI가 스크립트부터 영상까지 한 번에 처리합니다
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {quickActions.map((action) => (
            <Link key={action.title} href="/create">
              <Card className={`group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative border border-gray-100 ${action.borderColor}`}>
                {action.badge && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold bg-[#1a5c2e] text-white rounded-full px-2 py-0.5 tracking-wide">
                    {action.badge}
                  </span>
                )}
                <div className={`w-11 h-11 ${action.bgColor} rounded-xl flex items-center justify-center ${action.color} mb-3.5 group-hover:scale-110 transition-transform duration-300`}>
                  {action.icon}
                </div>
                <h4 className="text-sm font-semibold text-[#111827] mb-1">{action.title}</h4>
                <p className="text-xs text-[#6b7280] leading-relaxed">{action.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Production Tips ───────────────────────────────────────────────────── */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-[#111827]">제작 팁</h3>
          <p className="text-sm text-[#6b7280] mt-0.5">
            조인앤조인 식품 광고 영상에서 효과가 검증된 제작 원칙
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {productionTips.map((item, idx) => (
            <Card
              key={idx}
              className="border-l-4 border-l-[#22c55e] rounded-l-none"
            >
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 flex-shrink-0 bg-green-50 rounded-lg flex items-center justify-center text-[#1a5c2e] mt-0.5">
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#111827] leading-snug mb-1.5">
                    {item.tip}
                  </p>
                  <p className="text-xs text-[#6b7280] leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

    </div>
  );
}
