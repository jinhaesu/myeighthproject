'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import TextArea from '@/components/ui/TextArea';
import ProgressBar from '@/components/ui/ProgressBar';
import { apiGet, apiPost } from '@/lib/api';
import { cn, contentTypeLabel } from '@/lib/utils';
import type {
  ContentType,
  Language,
  Platform,
  PlatformAccount,
  PipelineResult,
  PipelineStepResult,
  PlanItem,
} from '@/types';

// ─── Constants ──────────────────────────────────────────────────────────────

const contentTypeOptions = [
  { value: 'health_info', label: '건강정보' },
  { value: 'recipe', label: '레시피' },
  { value: 'nutrition_tip', label: '영양팁' },
];

const languageOptions = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
];

const platformMeta: Record<Platform, { label: string; color: string; icon: string }> = {
  instagram: { label: 'Instagram', color: 'bg-purple-100 text-purple-700', icon: 'IG' },
  youtube: { label: 'YouTube', color: 'bg-red-100 text-red-700', icon: 'YT' },
  tiktok: { label: 'TikTok', color: 'bg-gray-900 text-white', icon: 'TT' },
  facebook: { label: 'Facebook', color: 'bg-blue-100 text-blue-700', icon: 'FB' },
};

const STEP_LABELS: Record<string, string> = {
  content_create: '콘텐츠 생성',
  script: '스크립트 생성 (AI)',
  image: '이미지 생성 (DALL-E 3)',
  tts: 'TTS 음성 생성',
  bgm: 'BGM 생성 (Mubert)',
  video: '영상 합성',
  caption: '캡션/해시태그 생성',
  publish_schedule: '배포 예약',
};

const STEP_ORDER = ['content_create', 'script', 'image', 'tts', 'bgm', 'video', 'caption', 'publish_schedule'];

// ─── Component ──────────────────────────────────────────────────────────────

export default function AutomationPage() {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'plan'>('single');
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccount[]>([]);

  // Load platform accounts
  useEffect(() => {
    apiGet<PlatformAccount[]>('/api/platforms')
      .then((res) => {
        if (res.data) setPlatformAccounts(res.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1a1a2e]">자동화 파이프라인</h1>
        <p className="text-gray-500 mt-1">
          주제만 입력하면 스크립트, 음성, 영상, 배포까지 자동으로 처리합니다.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'single' as const, label: '원클릭 생성' },
          { key: 'bulk' as const, label: '벌크 생성' },
          { key: 'plan' as const, label: '월간 자동 기획' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-white text-[#1a5c2e] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'single' && (
        <SinglePipelineSection platformAccounts={platformAccounts} />
      )}
      {activeTab === 'bulk' && (
        <BulkPipelineSection platformAccounts={platformAccounts} />
      )}
      {activeTab === 'plan' && (
        <PlanSection platformAccounts={platformAccounts} />
      )}
    </div>
  );
}

// ─── Section A: Single Pipeline ─────────────────────────────────────────────

function SinglePipelineSection({ platformAccounts }: { platformAccounts: PlatformAccount[] }) {
  const [contentType, setContentType] = useState<ContentType>('health_info');
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState<Language>('ko');
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [autoCaption, setAutoCaption] = useState(true);
  const [premiumMode, setPremiumMode] = useState(false);

  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<PipelineStepResult[]>([]);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const progressPercent = result
    ? 100
    : running
    ? (completedSteps.length / STEP_ORDER.length) * 100
    : 0;

  async function handleStart() {
    if (!topic.trim()) {
      setError('주제를 입력해주세요.');
      return;
    }
    setError(null);
    setRunning(true);
    setResult(null);
    setCompletedSteps([]);

    // Simulate step progression
    const stepTimer = setInterval(() => {
      setCurrentStep((prev) => {
        const currentIdx = prev ? STEP_ORDER.indexOf(prev) : -1;
        const nextIdx = currentIdx + 1;
        if (nextIdx < STEP_ORDER.length) {
          return STEP_ORDER[nextIdx];
        }
        return prev;
      });
    }, 3000);

    // Start with first step
    setCurrentStep(STEP_ORDER[0]);

    try {
      const res = await apiPost<PipelineResult>('/api/pipeline', {
        content_type: contentType,
        topic,
        language,
        platforms: selectedAccounts,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        auto_caption: autoCaption,
        premium_mode: premiumMode,
      });

      clearInterval(stepTimer);

      if (res.data) {
        setResult(res.data);
        setCompletedSteps(res.data.steps);
        setCurrentStep(null);
      }
    } catch (err) {
      clearInterval(stepTimer);
      setError(err instanceof Error ? err.message : '파이프라인 실행 실패');
    } finally {
      setRunning(false);
    }
  }

  function handleReset() {
    setResult(null);
    setCompletedSteps([]);
    setCurrentStep(null);
    setError(null);
    setTopic('');
  }

  return (
    <div className="space-y-6">
      {/* Hero Card */}
      <Card className="bg-gradient-to-r from-[#1a5c2e] to-[#2d8a4e] text-white">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold">원클릭 자동 생성</h2>
            <p className="text-white/80 mt-1">
              주제만 입력하면 스크립트 &rarr; 음성 &rarr; 영상 &rarr; 배포까지 자동!
            </p>
          </div>
        </div>
      </Card>

      {/* Form or Result */}
      {result ? (
        <Card className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#1a1a2e]">파이프라인 완료</h3>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              새로 만들기
            </Button>
          </div>

          <div className="bg-[#e8f5e9] border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-[#1a5c2e] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-[#1a5c2e]">
                전체 파이프라인이 완료되었습니다!
              </p>
              <p className="text-xs text-[#1a5c2e]/70 mt-0.5">
                소요 시간: {(result.total_duration_ms / 1000).toFixed(1)}초 | 콘텐츠 ID: {result.content_id}
              </p>
            </div>
          </div>

          {/* Step Results */}
          <div className="space-y-2">
            {result.steps.map((step, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg text-sm',
                  step.status === 'success'
                    ? 'bg-green-50'
                    : step.status === 'failed'
                    ? 'bg-red-50'
                    : 'bg-gray-50'
                )}
              >
                {step.status === 'success' ? (
                  <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : step.status === 'failed' ? (
                  <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                )}
                <span className="font-medium">{STEP_LABELS[step.step] || step.step}</span>
                {step.duration_ms != null && (
                  <span className="text-gray-400 ml-auto">{(step.duration_ms / 1000).toFixed(1)}s</span>
                )}
                {step.error && (
                  <span className="text-red-500 ml-2 text-xs">{step.error}</span>
                )}
              </div>
            ))}
          </div>

          {result.publish_job_ids.length > 0 && (
            <p className="text-sm text-gray-500">
              배포 예약 ID: {result.publish_job_ids.join(', ')}
            </p>
          )}
        </Card>
      ) : (
        <Card className="space-y-6">
          <h3 className="text-lg font-semibold text-[#1a1a2e]">콘텐츠 정보 입력</h3>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Select
              id="auto-content-type"
              label="콘텐츠 유형"
              options={contentTypeOptions}
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
              disabled={running}
            />
            <Select
              id="auto-language"
              label="언어"
              options={languageOptions}
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              disabled={running}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="auto-topic" className="text-sm font-medium text-[#1a1a2e]">
              주제
            </label>
            <input
              id="auto-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 장 건강을 위한 식습관"
              disabled={running}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#1a1a2e] placeholder:text-gray-400 focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/20 disabled:opacity-50"
            />
          </div>

          {/* Platform Selection */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[#1a1a2e]">플랫폼 선택</span>
            {platformAccounts.filter((a) => a.is_active).length === 0 ? (
              <p className="text-sm text-gray-500">
                등록된 플랫폼 계정이 없습니다.{' '}
                <a href="/settings" className="text-[#1a5c2e] hover:underline">설정에서 추가</a>해주세요.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {platformAccounts.filter((a) => a.is_active).map((account) => {
                  const pm = platformMeta[account.platform];
                  const checked = selectedAccounts.includes(account.id);
                  return (
                    <label
                      key={account.id}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                        checked
                          ? 'border-[#1a5c2e] bg-[#e8f5e9]'
                          : 'border-gray-200 hover:border-gray-300',
                        running && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={running}
                        onChange={() =>
                          setSelectedAccounts((prev) =>
                            prev.includes(account.id)
                              ? prev.filter((id) => id !== account.id)
                              : [...prev, account.id]
                          )
                        }
                        className="accent-[#1a5c2e]"
                      />
                      <span className={cn('text-xs font-bold px-1 rounded', pm.color)}>
                        {pm.icon}
                      </span>
                      <span className="text-sm">{account.account_name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auto-schedule" className="text-sm font-medium text-[#1a1a2e]">
                배포 일시 (선택)
              </label>
              <input
                id="auto-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={running}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#1a1a2e] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/20 disabled:opacity-50"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCaption}
                  onChange={(e) => setAutoCaption(e.target.checked)}
                  disabled={running}
                  className="accent-[#1a5c2e]"
                />
                <span className="text-sm text-[#1a1a2e]">AI 캡션 자동 생성</span>
              </label>
            </div>
          </div>

          {/* Premium Mode Toggle */}
          <div className={cn(
            'rounded-xl border p-4 transition-all',
            premiumMode
              ? 'border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50'
              : 'border-gray-200 bg-gray-50'
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  premiumMode ? 'bg-amber-100' : 'bg-gray-200'
                )}>
                  <svg className={cn('w-5 h-5', premiumMode ? 'text-amber-600' : 'text-gray-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div>
                  <span className={cn(
                    'text-sm font-semibold',
                    premiumMode ? 'text-amber-800' : 'text-gray-600'
                  )}>
                    프리미엄 모드
                  </span>
                  <p className={cn(
                    'text-xs mt-0.5',
                    premiumMode ? 'text-amber-600' : 'text-gray-400'
                  )}>
                    ElevenLabs TTS + DALL-E 3 이미지 + Mubert BGM
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={premiumMode}
                onClick={() => setPremiumMode(!premiumMode)}
                disabled={running}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2',
                  premiumMode ? 'bg-amber-500 focus:ring-amber-500' : 'bg-gray-300 focus:ring-gray-400',
                  running && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    premiumMode ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
            {premiumMode && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white/80 rounded-lg px-2 py-1.5 text-center">
                  <span className="font-medium text-amber-700">ElevenLabs</span>
                  <p className="text-amber-500">프리미엄 TTS</p>
                </div>
                <div className="bg-white/80 rounded-lg px-2 py-1.5 text-center">
                  <span className="font-medium text-amber-700">DALL-E 3</span>
                  <p className="text-amber-500">AI 이미지</p>
                </div>
                <div className="bg-white/80 rounded-lg px-2 py-1.5 text-center">
                  <span className="font-medium text-amber-700">Mubert</span>
                  <p className="text-amber-500">AI BGM</p>
                </div>
              </div>
            )}
          </div>

          {/* Progress */}
          {running && (
            <div className="space-y-3">
              <ProgressBar value={progressPercent} />
              <div className="space-y-1">
                {STEP_ORDER.map((stepKey) => {
                  const isCompleted = completedSteps.some((s) => s.step === stepKey);
                  const isCurrent = currentStep === stepKey;
                  return (
                    <div
                      key={stepKey}
                      className={cn(
                        'flex items-center gap-2 text-sm py-1',
                        isCompleted
                          ? 'text-green-600'
                          : isCurrent
                          ? 'text-[#1a5c2e] font-medium'
                          : 'text-gray-400'
                      )}
                    >
                      {isCompleted ? (
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isCurrent ? (
                        <div className="w-4 h-4 border-2 border-[#1a5c2e] border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
                      )}
                      <span>{STEP_LABELS[stepKey] || stepKey}</span>
                      {isCurrent && <span className="text-gray-400">처리 중...</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleStart} disabled={running || !topic.trim()} size="lg">
              {running ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  자동 생성 중...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  자동 생성 시작
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Section B: Bulk Pipeline ───────────────────────────────────────────────

function BulkPipelineSection({ platformAccounts }: { platformAccounts: PlatformAccount[] }) {
  const [topics, setTopics] = useState('');
  const [language, setLanguage] = useState<Language>('ko');
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [startDate, setStartDate] = useState('');
  const [postTime, setPostTime] = useState('09:00');
  const [autoSchedule, setAutoSchedule] = useState(true);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bulkResult, setBulkResult] = useState<{
    total: number;
    completed: number;
    failed: number;
    results: PipelineResult[];
    errors: Array<{ index: number; topic: string; error: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AI topic suggestion
  const [suggestLoading, setSuggestLoading] = useState(false);

  async function handleAISuggest() {
    setSuggestLoading(true);
    try {
      // Use plan API with current month to get 5 suggestions
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const res = await apiPost<{ items: PlanItem[] }>('/api/pipeline/plan', {
        month,
        contents_per_week: 5,
        content_types: ['health_info', 'recipe', 'nutrition_tip'],
        brand_keywords: ['널담', '건강식품', 'K-Food'],
      });
      if (res.data?.items) {
        const suggestedTopics = res.data.items.slice(0, 5).map((item: PlanItem) => item.topic);
        setTopics(suggestedTopics.join('\n'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 추천 실패');
    } finally {
      setSuggestLoading(false);
    }
  }

  async function handleBulkStart() {
    const topicList = topics
      .split('\n')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (topicList.length === 0) {
      setError('주제를 1개 이상 입력해주세요.');
      return;
    }

    setError(null);
    setRunning(true);
    setBulkResult(null);
    setProgress(0);

    // Build items - assign content types in rotation
    const contentTypes: ContentType[] = ['health_info', 'recipe', 'nutrition_tip'];
    const items = topicList.map((topic, idx) => ({
      content_type: contentTypes[idx % contentTypes.length],
      topic,
    }));

    // Simulate progress
    const progressTimer = setInterval(() => {
      setProgress((prev) => Math.min(prev + (100 / topicList.length / 6), 95));
    }, 2000);

    try {
      const res = await apiPost<{
        total: number;
        completed: number;
        failed: number;
        results: PipelineResult[];
        errors: Array<{ index: number; topic: string; error: string }>;
      }>('/api/pipeline/bulk', {
        items,
        language,
        platforms: selectedAccounts,
        auto_schedule: autoSchedule,
        start_date: startDate || undefined,
        post_time: postTime,
      });

      clearInterval(progressTimer);
      setProgress(100);

      if (res.data) {
        setBulkResult(res.data);
      }
    } catch (err) {
      clearInterval(progressTimer);
      setError(err instanceof Error ? err.message : '벌크 생성 실패');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#1a1a2e]">벌크 콘텐츠 생성</h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAISuggest}
            disabled={suggestLoading || running}
          >
            {suggestLoading ? (
              <>
                <div className="w-3 h-3 border-2 border-[#1a5c2e] border-t-transparent rounded-full animate-spin" />
                추천 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                AI 자동 추천 (5개)
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <TextArea
          id="bulk-topics"
          label="주제 목록 (줄바꿈으로 구분)"
          value={topics}
          onChange={(e) => setTopics(e.target.value)}
          placeholder={"장 건강을 위한 식습관\n비타민D 부족 증상\n간단 김치볶음밥 레시피\n봄철 면역력 높이는 음식\n프로바이오틱스 올바른 섭취법"}
          className="min-h-[160px]"
          disabled={running}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            id="bulk-language"
            label="언어"
            options={languageOptions}
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            disabled={running}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bulk-time" className="text-sm font-medium text-[#1a1a2e]">
              게시 시간
            </label>
            <input
              id="bulk-time"
              type="time"
              value={postTime}
              onChange={(e) => setPostTime(e.target.value)}
              disabled={running}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#1a1a2e] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/20 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Platform Selection */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[#1a1a2e]">플랫폼 선택</span>
          <div className="grid grid-cols-2 gap-2">
            {platformAccounts.filter((a) => a.is_active).map((account) => {
              const pm = platformMeta[account.platform];
              const checked = selectedAccounts.includes(account.id);
              return (
                <label
                  key={account.id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                    checked
                      ? 'border-[#1a5c2e] bg-[#e8f5e9]'
                      : 'border-gray-200 hover:border-gray-300',
                    running && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={running}
                    onChange={() =>
                      setSelectedAccounts((prev) =>
                        prev.includes(account.id)
                          ? prev.filter((id) => id !== account.id)
                          : [...prev, account.id]
                      )
                    }
                    className="accent-[#1a5c2e]"
                  />
                  <span className={cn('text-xs font-bold px-1 rounded', pm.color)}>
                    {pm.icon}
                  </span>
                  <span className="text-sm">{account.account_name}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bulk-start-date" className="text-sm font-medium text-[#1a1a2e]">
              시작일
            </label>
            <input
              id="bulk-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={running}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#1a1a2e] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/20 disabled:opacity-50"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSchedule}
                onChange={(e) => setAutoSchedule(e.target.checked)}
                disabled={running}
                className="accent-[#1a5c2e]"
              />
              <span className="text-sm text-[#1a1a2e]">하루 1개씩 자동 스케줄</span>
            </label>
          </div>
        </div>

        {/* Progress */}
        {running && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">벌크 생성 진행 중...</span>
              <span className="font-medium text-[#1a5c2e]">{Math.round(progress)}%</span>
            </div>
            <ProgressBar value={progress} />
          </div>
        )}

        {/* Bulk Result */}
        {bulkResult && (
          <div className="space-y-4">
            <div className={cn(
              'rounded-lg p-4 flex items-center gap-3',
              bulkResult.failed === 0 ? 'bg-[#e8f5e9] border border-green-200' : 'bg-yellow-50 border border-yellow-200'
            )}>
              <svg className={cn('w-6 h-6 shrink-0', bulkResult.failed === 0 ? 'text-[#1a5c2e]' : 'text-yellow-600')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium">
                  {bulkResult.completed}/{bulkResult.total}개 완료
                  {bulkResult.failed > 0 && ` (${bulkResult.failed}개 실패)`}
                </p>
              </div>
            </div>

            {bulkResult.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-600">실패 항목:</p>
                {bulkResult.errors.map((err, idx) => (
                  <div key={idx} className="bg-red-50 p-2 rounded text-sm text-red-700">
                    [{err.index + 1}] {err.topic}: {err.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleBulkStart}
            disabled={running || !topics.trim()}
            size="lg"
          >
            {running ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                일괄 생성 중...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                일괄 생성 시작
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Section C: Monthly Plan ────────────────────────────────────────────────

function PlanSection({ platformAccounts }: { platformAccounts: PlatformAccount[] }) {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const defaultMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

  const [month, setMonth] = useState(defaultMonth);
  const [contentsPerWeek, setContentsPerWeek] = useState(5);
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(['health_info', 'recipe', 'nutrition_tip']);
  const [brandKeywords, setBrandKeywords] = useState('널담, 건강식품, K-Food');

  const [loading, setLoading] = useState(false);
  const [planItems, setPlanItems] = useState<Array<PlanItem & { event_id: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  // Bulk generation from plan
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkDone, setBulkDone] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);

  async function handleGeneratePlan() {
    setError(null);
    setLoading(true);
    setPlanItems([]);
    setBulkDone(false);

    try {
      const res = await apiPost<{ items: Array<PlanItem & { event_id: number }> }>('/api/pipeline/plan', {
        month,
        contents_per_week: contentsPerWeek,
        content_types: selectedTypes,
        brand_keywords: brandKeywords.split(',').map((k) => k.trim()).filter(Boolean),
      });

      if (res.data?.items) {
        setPlanItems(res.data.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '월간 계획 생성 실패');
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkFromPlan() {
    if (planItems.length === 0) return;

    setBulkRunning(true);
    setBulkProgress(0);

    const progressTimer = setInterval(() => {
      setBulkProgress((prev) => Math.min(prev + 2, 95));
    }, 2000);

    try {
      const items = planItems.map((item) => ({
        content_type: item.content_type,
        topic: item.topic,
      }));

      await apiPost('/api/pipeline/bulk', {
        items,
        language: 'ko',
        platforms: selectedAccounts,
        auto_schedule: true,
        start_date: planItems[0]?.date,
        post_time: '09:00',
      });

      clearInterval(progressTimer);
      setBulkProgress(100);
      setBulkDone(true);
    } catch (err) {
      clearInterval(progressTimer);
      setError(err instanceof Error ? err.message : '벌크 생성 실패');
    } finally {
      setBulkRunning(false);
    }
  }

  // Group plan items by week
  function getWeekNumber(dateStr: string): number {
    const date = new Date(dateStr);
    return Math.ceil(date.getDate() / 7);
  }

  const weekGroups: Record<number, Array<PlanItem & { event_id: number }>> = {};
  for (const item of planItems) {
    const week = getWeekNumber(item.date);
    if (!weekGroups[week]) weekGroups[week] = [];
    weekGroups[week].push(item);
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <h3 className="text-lg font-semibold text-[#1a1a2e]">AI 월간 콘텐츠 기획</h3>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="plan-month" className="text-sm font-medium text-[#1a1a2e]">
              대상 월
            </label>
            <input
              id="plan-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#1a1a2e] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/20 disabled:opacity-50"
            />
          </div>
          <Select
            id="plan-per-week"
            label="주당 콘텐츠 수"
            options={[
              { value: '3', label: '3개' },
              { value: '5', label: '5개' },
              { value: '7', label: '7개' },
            ]}
            value={String(contentsPerWeek)}
            onChange={(e) => setContentsPerWeek(parseInt(e.target.value, 10))}
            disabled={loading}
          />
        </div>

        {/* Content Type Checkboxes */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[#1a1a2e]">콘텐츠 유형</span>
          <div className="flex gap-3">
            {contentTypeOptions.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(opt.value as ContentType)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTypes((prev) => [...prev, opt.value as ContentType]);
                    } else {
                      setSelectedTypes((prev) => prev.filter((t) => t !== opt.value));
                    }
                  }}
                  disabled={loading}
                  className="accent-[#1a5c2e]"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="plan-keywords" className="text-sm font-medium text-[#1a1a2e]">
            브랜드 키워드 (쉼표 구분)
          </label>
          <input
            id="plan-keywords"
            type="text"
            value={brandKeywords}
            onChange={(e) => setBrandKeywords(e.target.value)}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#1a1a2e] placeholder:text-gray-400 focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/20 disabled:opacity-50"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleGeneratePlan} disabled={loading || selectedTypes.length === 0} size="lg">
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                AI 기획 중...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                AI 월간 계획 생성
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Plan Result - Calendar View */}
      {planItems.length > 0 && (
        <Card className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#1a1a2e]">
              {month} 콘텐츠 캘린더 ({planItems.length}개)
            </h3>
          </div>

          {/* Weekly Groups */}
          {Object.entries(weekGroups)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([week, items]) => (
              <div key={week} className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  {week}주차
                </h4>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg hover:bg-gray-50"
                    >
                      <div className="text-sm font-mono text-gray-400 w-20 shrink-0 pt-0.5">
                        {item.date.slice(5)}
                      </div>
                      <span
                        className={cn(
                          'text-xs font-bold px-2 py-0.5 rounded shrink-0',
                          item.content_type === 'health_info'
                            ? 'bg-blue-100 text-blue-700'
                            : item.content_type === 'recipe'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-purple-100 text-purple-700'
                        )}
                      >
                        {contentTypeLabel(item.content_type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1a1a2e]">{item.topic}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {/* Bulk generation from plan */}
          <div className="border-t pt-6 space-y-4">
            <h4 className="text-sm font-semibold text-[#1a1a2e]">전체 생성 시작</h4>

            {/* Platform Selection for bulk */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[#1a1a2e]">배포 플랫폼</span>
              <div className="grid grid-cols-2 gap-2">
                {platformAccounts.filter((a) => a.is_active).map((account) => {
                  const pm = platformMeta[account.platform];
                  const checked = selectedAccounts.includes(account.id);
                  return (
                    <label
                      key={account.id}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                        checked
                          ? 'border-[#1a5c2e] bg-[#e8f5e9]'
                          : 'border-gray-200 hover:border-gray-300',
                        bulkRunning && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={bulkRunning}
                        onChange={() =>
                          setSelectedAccounts((prev) =>
                            prev.includes(account.id)
                              ? prev.filter((id) => id !== account.id)
                              : [...prev, account.id]
                          )
                        }
                        className="accent-[#1a5c2e]"
                      />
                      <span className={cn('text-xs font-bold px-1 rounded', pm.color)}>
                        {pm.icon}
                      </span>
                      <span className="text-sm">{account.account_name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {bulkRunning && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">전체 생성 진행 중...</span>
                  <span className="font-medium text-[#1a5c2e]">{Math.round(bulkProgress)}%</span>
                </div>
                <ProgressBar value={bulkProgress} />
              </div>
            )}

            {bulkDone && (
              <div className="bg-[#e8f5e9] border border-green-200 rounded-lg p-4 flex items-center gap-3">
                <svg className="w-6 h-6 text-[#1a5c2e] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-[#1a5c2e]">
                  전체 콘텐츠 생성이 완료되었습니다!
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleBulkFromPlan}
                disabled={bulkRunning || bulkDone}
                size="lg"
              >
                {bulkRunning ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    생성 중...
                  </>
                ) : bulkDone ? (
                  '완료됨'
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {planItems.length}개 전체 생성 시작
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
