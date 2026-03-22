'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { apiGet, apiPost } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import type { PlatformAccount, Platform } from '@/types';

// Platform config

const platformConfig: Record<Platform, { label: string; bgColor: string; iconBg: string }> = {
  instagram: {
    label: 'Instagram',
    bgColor: 'bg-gradient-to-r from-purple-500 to-pink-500',
    iconBg: 'bg-gradient-to-br from-purple-500 to-pink-500',
  },
  youtube: {
    label: 'YouTube',
    bgColor: 'bg-red-600',
    iconBg: 'bg-red-600',
  },
  tiktok: {
    label: 'TikTok',
    bgColor: 'bg-gray-900',
    iconBg: 'bg-gray-900',
  },
  facebook: {
    label: 'Facebook',
    bgColor: 'bg-blue-600',
    iconBg: 'bg-blue-600',
  },
};

const platformOptions = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
];

type SettingsTab = 'platforms' | 'general';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('platforms');
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [newPlatform, setNewPlatform] = useState<Platform>('instagram');
  const [newName, setNewName] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiGet<PlatformAccount[]>('/api/platforms');
      if (res.data) setAccounts(res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchAccounts().finally(() => setLoading(false));
  }, [fetchAccounts]);

  async function handleAdd() {
    if (!newName.trim()) {
      setError('계정 이름을 입력해주세요.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/platforms', {
        platform: newPlatform,
        account_name: newName.trim(),
        handle: newHandle.trim() || undefined,
      });
      setModalOpen(false);
      setNewPlatform('instagram');
      setNewName('');
      setNewHandle('');
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : '계정 추가 실패');
    } finally {
      setSubmitting(false);
    }
  }

  // Group accounts by platform
  const grouped = accounts.reduce<Record<Platform, PlatformAccount[]>>(
    (acc, account) => {
      if (!acc[account.platform]) acc[account.platform] = [];
      acc[account.platform].push(account);
      return acc;
    },
    {} as Record<Platform, PlatformAccount[]>
  );

  const settingsTabs: { value: SettingsTab; label: string }[] = [
    { value: 'platforms', label: '플랫폼 계정' },
    { value: 'general', label: '일반 설정' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6b7280]">플랫폼 계정 및 시스템 설정을 관리합니다</p>
        {activeTab === 'platforms' && (
          <Button onClick={() => setModalOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            계정 추가
          </Button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm w-fit">
        {settingsTabs.map((tab) => (
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

      {/* Platforms tab */}
      {activeTab === 'platforms' && (
        <>
          {loading ? (
            <Card className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#22c55e] rounded-full animate-spin" />
            </Card>
          ) : accounts.length === 0 ? (
            <Card className="text-center py-16 space-y-4">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[#111827] font-medium mb-1">등록된 플랫폼 계정이 없습니다</p>
                <p className="text-sm text-[#6b7280]">플랫폼 계정을 추가하여 콘텐츠를 배포하세요</p>
              </div>
              <Button onClick={() => setModalOpen(true)}>첫 계정 추가하기</Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {(Object.keys(platformConfig) as Platform[]).map((platform) => {
                const cfg = platformConfig[platform];
                const platformAccounts = grouped[platform] || [];
                if (platformAccounts.length === 0) return null;

                return (
                  <Card key={platform} className="p-0 overflow-hidden">
                    <div className="px-5 py-4 flex items-center gap-3 border-b border-gray-100">
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold', cfg.iconBg)}>
                        {platform === 'instagram' && 'IG'}
                        {platform === 'youtube' && 'YT'}
                        {platform === 'tiktok' && 'TT'}
                        {platform === 'facebook' && 'FB'}
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-[#111827]">{cfg.label}</span>
                        <p className="text-xs text-[#6b7280]">{platformAccounts.length}개 계정</p>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {platformAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
                        >
                          <div>
                            <p className="text-sm font-medium text-[#111827]">{account.account_name}</p>
                            {account.handle && (
                              <p className="text-xs text-[#6b7280] mt-0.5">@{account.handle}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-gray-400">
                              {formatDateTime(account.created_at)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  'w-2 h-2 rounded-full',
                                  account.is_active ? 'bg-[#22c55e]' : 'bg-gray-300'
                                )}
                              />
                              <span className={cn(
                                'text-xs font-medium',
                                account.is_active ? 'text-green-600' : 'text-gray-400'
                              )}>
                                {account.is_active ? '연결됨' : '비활성'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* General settings tab */}
      {activeTab === 'general' && (
        <Card className="space-y-6">
          <div>
            <h3 className="text-base font-semibold text-[#111827]">일반 설정</h3>
            <p className="text-sm text-[#6b7280] mt-1">시스템 기본 설정을 관리합니다</p>
          </div>

          <div className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#111827]">기본 언어</label>
              <select className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 w-fit">
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#111827]">기본 콘텐츠 유형</label>
              <select className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 w-fit">
                <option value="health_info">건강정보</option>
                <option value="recipe">레시피</option>
                <option value="nutrition_tip">영양팁</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#111827]">TTS 음성</label>
              <select className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 w-fit">
                <option value="default">기본 음성</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <Button>설정 저장</Button>
          </div>
        </Card>
      )}

      {/* Add Account Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="플랫폼 계정 추가">
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <Select
            id="new-platform"
            label="플랫폼"
            options={platformOptions}
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value as Platform)}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-name" className="text-sm font-medium text-[#111827]">
              계정 이름
            </label>
            <input
              id="new-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: 널담 공식 계정"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] placeholder:text-gray-400 focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 transition-all"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-handle" className="text-sm font-medium text-[#111827]">
              핸들 (선택)
            </label>
            <input
              id="new-handle"
              type="text"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              placeholder="예: nuldam_official"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] placeholder:text-gray-400 focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 transition-all"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAdd} disabled={submitting || !newName.trim()}>
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  처리 중...
                </>
              ) : (
                '추가'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
