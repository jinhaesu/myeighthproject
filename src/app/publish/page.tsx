'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import TextArea from '@/components/ui/TextArea';
import { apiGet, apiPost, apiDelete, apiPatch } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import type {
  PublishJob,
  PlatformAccount,
  Content,
  PublishStatus,
  Platform,
} from '@/types';

// Platform helpers

const platformMeta: Record<Platform, { label: string; color: string; iconBg: string; icon: string }> = {
  instagram: { label: 'Instagram', color: 'text-purple-600', iconBg: 'bg-gradient-to-br from-purple-500 to-pink-500', icon: 'IG' },
  youtube: { label: 'YouTube', color: 'text-red-600', iconBg: 'bg-red-600', icon: 'YT' },
  tiktok: { label: 'TikTok', color: 'text-gray-900', iconBg: 'bg-gray-900', icon: 'TT' },
  facebook: { label: 'Facebook', color: 'text-blue-600', iconBg: 'bg-blue-600', icon: 'FB' },
};

const statusMeta: Record<PublishStatus, { label: string; color: string; dotClass: string }> = {
  scheduled: { label: '예약됨', color: 'bg-blue-50 text-blue-700 border border-blue-100', dotClass: 'bg-blue-500' },
  publishing: { label: '진행중', color: 'bg-amber-50 text-amber-700 border border-amber-100', dotClass: 'bg-amber-500 animate-pulse-dot' },
  published: { label: '완료', color: 'bg-green-50 text-green-700 border border-green-100', dotClass: 'bg-green-500' },
  failed: { label: '실패', color: 'bg-red-50 text-red-700 border border-red-100', dotClass: 'bg-red-500' },
  cancelled: { label: '취소됨', color: 'bg-gray-50 text-gray-500 border border-gray-100', dotClass: 'bg-gray-400' },
};

type TabFilter = 'all' | PublishStatus;

const tabs: { value: TabFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'scheduled', label: '예약됨' },
  { value: 'published', label: '완료' },
  { value: 'failed', label: '실패' },
];

export default function PublishPage() {
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedContentId, setSelectedContentId] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const statusParam = activeTab !== 'all' ? `?status=${activeTab}` : '';
      const res = await apiGet<PublishJob[]>(`/api/publish${statusParam}`);
      if (res.data) setJobs(res.data);
    } catch {
      // silent
    }
  }, [activeTab]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiGet<PlatformAccount[]>('/api/platforms');
      if (res.data) setAccounts(res.data);
    } catch {
      // silent
    }
  }, []);

  const fetchContents = useCallback(async () => {
    try {
      const res = await apiGet<Content[]>('/api/contents?limit=100');
      if (res.data) setContents(res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchJobs(), fetchAccounts(), fetchContents()]).finally(() =>
      setLoading(false)
    );
  }, [fetchJobs, fetchAccounts, fetchContents]);

  // Summary counts
  const counts = {
    scheduled: jobs.filter((j) => j.status === 'scheduled').length,
    publishing: jobs.filter((j) => j.status === 'publishing').length,
    published: jobs.filter((j) => j.status === 'published').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };

  const filteredJobs =
    activeTab === 'all'
      ? jobs
      : jobs.filter((j) => j.status === activeTab);

  async function handleCancel(jobId: number) {
    try {
      await apiDelete(`/api/publish/${jobId}`);
      await fetchJobs();
    } catch {
      // silent
    }
  }

  async function handleRetry(jobId: number) {
    try {
      await apiPatch(`/api/publish/${jobId}`, {
        status: 'scheduled',
        error_message: null,
      });
      await fetchJobs();
    } catch {
      // silent
    }
  }

  function toggleAccount(accountId: number) {
    setSelectedAccounts((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId]
    );
  }

  async function handleSchedule() {
    if (!selectedContentId || selectedAccounts.length === 0 || !scheduledAt) return;
    setSubmitting(true);
    try {
      if (selectedAccounts.length === 1) {
        await apiPost('/api/publish', {
          content_id: Number(selectedContentId),
          platform_account_id: selectedAccounts[0],
          scheduled_at: new Date(scheduledAt).toISOString(),
          caption: caption || undefined,
        });
      } else {
        await apiPost('/api/publish', {
          content_id: Number(selectedContentId),
          platforms: selectedAccounts.map((id) => ({
            platform_account_id: id,
            scheduled_at: new Date(scheduledAt).toISOString(),
            caption: caption || undefined,
          })),
        });
      }
      setModalOpen(false);
      setSelectedContentId('');
      setSelectedAccounts([]);
      setScheduledAt('');
      setCaption('');
      await fetchJobs();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }

  const summaryCards = [
    { label: '예약됨', count: counts.scheduled, color: 'text-blue-600', bgColor: 'bg-blue-50', icon: (
      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
    { label: '진행중', count: counts.publishing, color: 'text-amber-600', bgColor: 'bg-amber-50', icon: (
      <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    )},
    { label: '완료', count: counts.published, color: 'text-green-600', bgColor: 'bg-green-50', icon: (
      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
    { label: '실패', count: counts.failed, color: 'text-red-600', bgColor: 'bg-red-50', icon: (
      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6b7280]">배포 상태를 관리합니다</p>
        <Button onClick={() => setModalOpen(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          배포 예약
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="flex items-center gap-3">
            <div className={`w-10 h-10 ${card.bgColor} rounded-xl flex items-center justify-center`}>
              {card.icon}
            </div>
            <div>
              <p className="text-xs text-[#6b7280] font-medium">{card.label}</p>
              <p className={`text-2xl font-bold ${card.color}`}>{card.count}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'px-4 py-1.5 text-xs font-medium rounded-lg transition-all duration-200',
              activeTab === tab.value
                ? 'bg-[#1a5c2e] text-white shadow-sm'
                : 'text-[#6b7280] hover:text-[#111827] hover:bg-gray-50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Timeline / Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#22c55e] rounded-full animate-spin" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <p className="text-[#111827] font-medium mb-1">배포 작업이 없습니다</p>
            <p className="text-sm text-[#6b7280]">새 배포를 예약해 보세요</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredJobs.map((job) => {
              const pm = job.platform ? platformMeta[job.platform] : null;
              const sm = statusMeta[job.status];
              return (
                <div key={job.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors">
                  {/* Platform icon */}
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0',
                    pm?.iconBg || 'bg-gray-200'
                  )}>
                    {pm?.icon || '?'}
                  </div>

                  {/* Content info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#111827] truncate">
                      {job.content_title || `#${job.content_id}`}
                    </p>
                    <p className="text-xs text-[#6b7280] mt-0.5">
                      {pm?.label} {job.account_name ? `· ${job.account_name}` : ''} · {formatDateTime(job.scheduled_at)}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shrink-0',
                      sm.color
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full', sm.dotClass)} />
                    {sm.label}
                  </span>

                  {/* Post URL */}
                  {job.post_url && (
                    <a
                      href={job.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1a5c2e] hover:text-[#144723] transition-colors shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    {(job.status === 'scheduled' || job.status === 'publishing') && (
                      <button
                        onClick={() => handleCancel(job.id)}
                        className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        취소
                      </button>
                    )}
                    {job.status === 'failed' && (
                      <button
                        onClick={() => handleRetry(job.id)}
                        className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        재시도
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Schedule Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="배포 예약">
        <div className="space-y-5">
          <Select
            id="schedule-content"
            label="콘텐츠 선택"
            placeholder="콘텐츠를 선택하세요"
            options={contents.map((c) => ({
              value: String(c.id),
              label: c.title,
            }))}
            value={selectedContentId}
            onChange={(e) => setSelectedContentId(e.target.value)}
          />

          {/* Platform checkboxes */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[#111827]">플랫폼 선택</span>
            {accounts.length === 0 ? (
              <p className="text-sm text-[#6b7280] py-3 px-4 bg-gray-50 rounded-xl">
                등록된 플랫폼 계정이 없습니다. 설정에서 추가해주세요.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {accounts
                  .filter((a) => a.is_active)
                  .map((account) => {
                    const pm = platformMeta[account.platform];
                    const checked = selectedAccounts.includes(account.id);
                    return (
                      <label
                        key={account.id}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-all duration-200',
                          checked
                            ? 'border-[#1a5c2e] bg-green-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAccount(account.id)}
                          className="accent-[#1a5c2e]"
                        />
                        <span className={cn(
                          'w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center text-white',
                          pm.iconBg
                        )}>
                          {pm.icon}
                        </span>
                        <span className="text-sm text-[#111827]">{account.account_name}</span>
                      </label>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Datetime */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="schedule-datetime" className="text-sm font-medium text-[#111827]">
              예약 날짜/시간
            </label>
            <input
              id="schedule-datetime"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 transition-all"
            />
          </div>

          {/* Caption */}
          <TextArea
            id="schedule-caption"
            label="캡션 (선택)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="게시물 캡션을 입력하세요..."
            className="min-h-[80px]"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleSchedule}
              disabled={
                submitting ||
                !selectedContentId ||
                selectedAccounts.length === 0 ||
                !scheduledAt
              }
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  처리 중...
                </>
              ) : (
                '예약하기'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
