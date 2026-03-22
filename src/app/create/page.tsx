'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import TextArea from '@/components/ui/TextArea';
import ProgressBar from '@/components/ui/ProgressBar';
import { apiGet, apiPost, getFileUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Content, ContentType, Language, PlatformAccount, Platform } from '@/types';

// ─── Avatar Types ───────────────────────────────────────────────────────────

interface AvatarInfo {
  id: string;
  name: string;
  category: 'custom' | 'professional' | 'casual' | 'diverse';
  preview_url: string | null;
}

const DEFAULT_AVATAR_ID = '289259c61ef142ebba0bb463f35f864b';

const CATEGORY_LABELS: Record<string, string> = {
  custom: '커스텀',
  professional: '프로',
  casual: '캐주얼',
  diverse: '다양성',
};

const steps = [
  { number: 1, label: '기본 정보' },
  { number: 2, label: '스크립트 & 음성' },
  { number: 3, label: '영상 생성' },
  { number: 4, label: '배포 예약' },
];

const platformMeta: Record<Platform, { label: string; color: string; icon: string }> = {
  instagram: { label: 'Instagram', color: 'bg-purple-100 text-purple-700', icon: 'IG' },
  youtube: { label: 'YouTube', color: 'bg-red-100 text-red-700', icon: 'YT' },
  tiktok: { label: 'TikTok', color: 'bg-gray-900 text-white', icon: 'TT' },
  facebook: { label: 'Facebook', color: 'bg-blue-100 text-blue-700', icon: 'FB' },
};

const contentTypeOptions = [
  { value: 'health_info', label: '건강정보' },
  { value: 'recipe', label: '레시피' },
  { value: 'nutrition_tip', label: '영양팁' },
];

const languageOptions = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
];

export default function CreatePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 state
  const [contentType, setContentType] = useState<ContentType>('health_info');
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState<Language>('ko');

  // Created content
  const [contentId, setContentId] = useState<number | null>(null);

  // Step 2 state
  const [script, setScript] = useState('');
  const [scriptGenerated, setScriptGenerated] = useState(false);
  const [audioGenerated, setAudioGenerated] = useState(false);
  const [ttsProvider, setTtsProvider] = useState<'edge-tts' | 'elevenlabs'>('edge-tts');
  const [imageGenerated, setImageGenerated] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [bgmGenerated, setBgmGenerated] = useState(false);
  const [bgmGenerating, setBgmGenerating] = useState(false);

  // Step 3 state
  const [videoType, setVideoType] = useState<'slideshow' | 'heygen'>('heygen');
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(DEFAULT_AVATAR_ID);
  const [avatarsLoading, setAvatarsLoading] = useState(false);

  // Step 4 state
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [publishScheduledAt, setPublishScheduledAt] = useState('');
  const [publishCaption, setPublishCaption] = useState('');
  const [publishDone, setPublishDone] = useState(false);

  // Loading & error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load avatars when entering step 3 with heygen selected
  const loadAvatars = useCallback(async () => {
    if (avatars.length > 0) return;
    setAvatarsLoading(true);
    try {
      const res = await apiGet<AvatarInfo[]>('/api/avatars');
      if (res.data) {
        setAvatars(res.data);
      }
    } catch {
      // silently fail - will use default avatar
    } finally {
      setAvatarsLoading(false);
    }
  }, [avatars.length]);

  useEffect(() => {
    if (currentStep === 3 && videoType === 'heygen') {
      loadAvatars();
    }
  }, [currentStep, videoType, loadAvatars]);

  const progressPercent = ((currentStep - 1) / (steps.length)) * 100;

  // Step 1: Create content and go to step 2
  async function handleStep1Submit() {
    if (!topic.trim()) {
      setError('주제를 입력해주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiPost<Content>('/api/contents', {
        title: topic,
        content_type: contentType,
        language,
      });
      if (res.data) {
        setContentId(res.data.id);
        setCurrentStep(2);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '콘텐츠 생성 실패');
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Generate script
  async function handleGenerateScript() {
    if (!contentId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiPost<{ fullScript: string }>('/api/generate/script', {
        content_id: contentId,
        topic,
      });
      if (res.data) {
        setScript(res.data.fullScript);
        setScriptGenerated(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '스크립트 생성 실패');
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Generate TTS
  async function handleGenerateTTS() {
    if (!contentId) return;
    setError(null);
    setLoading(true);
    try {
      await apiPost('/api/generate/tts', {
        content_id: contentId,
        tts_provider: ttsProvider,
      });
      setAudioGenerated(true);
      setCurrentStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : '음성 생성 실패');
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Generate video
  async function handleGenerateVideo() {
    if (!contentId) return;
    setError(null);
    setLoading(true);
    try {
      if (videoType === 'heygen') {
        // HeyGen AI avatar video
        const res = await apiPost<{ videoPath: string }>('/api/generate/heygen', {
          content_id: contentId,
          avatar_id: selectedAvatarId,
        });
        if (res.data) {
          setVideoPath(res.data.videoPath);
        }
      } else {
        // Slideshow (DALL-E + Runway)
        const res = await apiPost<{ videoPath: string }>('/api/generate/video', {
          content_id: contentId,
        });
        if (res.data) {
          setVideoPath(res.data.videoPath);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '영상 생성 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Step indicator */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          {steps.map((step, idx) => (
            <div key={step.number} className="flex items-center">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300',
                    currentStep > step.number
                      ? 'bg-[#22c55e] text-white'
                      : currentStep === step.number
                        ? 'bg-[#1a5c2e] text-white ring-4 ring-[#1a5c2e]/10'
                        : 'bg-gray-100 text-gray-400'
                  )}
                >
                  {currentStep > step.number ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={cn(
                    'text-sm font-medium hidden sm:block',
                    currentStep >= step.number ? 'text-[#111827]' : 'text-gray-400'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={cn(
                  'w-12 md:w-20 h-[2px] mx-3 rounded-full transition-colors duration-300',
                  currentStep > step.number ? 'bg-[#22c55e]' : 'bg-gray-100'
                )} />
              )}
            </div>
          ))}
        </div>
        <ProgressBar value={progressPercent} />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-fade-in">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Step 1: Basic Info */}
      {currentStep === 1 && (
        <Card className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">기본 정보 입력</h2>
            <p className="text-sm text-[#6b7280] mt-1">콘텐츠의 유형과 주제를 선택해주세요</p>
          </div>

          <Select
            id="content-type"
            label="콘텐츠 유형"
            options={contentTypeOptions}
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentType)}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="topic" className="text-sm font-medium text-[#111827]">
              주제
            </label>
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 봄철 면역력 높이는 음식 5가지"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] placeholder:text-gray-400 focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 transition-all"
            />
          </div>

          <Select
            id="language"
            label="언어"
            options={languageOptions}
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          />

          <div className="flex justify-end pt-2">
            <Button onClick={handleStep1Submit} disabled={loading} size="lg">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  처리 중...
                </>
              ) : (
                <>
                  다음 단계
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Script & TTS */}
      {currentStep === 2 && (
        <Card className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">스크립트 & 음성 생성</h2>
            <p className="text-sm text-[#6b7280] mt-1">AI가 스크립트를 생성하고 음성으로 변환합니다</p>
          </div>

          {!scriptGenerated ? (
            <div className="text-center py-12 space-y-5">
              <div className="w-16 h-16 bg-gradient-to-br from-[#e8f5e9] to-[#c8e6c9] rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-[#1a5c2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-[#111827] font-medium mb-1">
                  스크립트를 생성할 준비가 되었습니다
                </p>
                <p className="text-sm text-[#6b7280]">
                  &quot;{topic}&quot; 주제로 AI가 스크립트를 작성합니다
                </p>
              </div>
              <Button onClick={handleGenerateScript} disabled={loading} size="lg">
                {loading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>AI가 스크립트를 생성하고 있습니다...</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    스크립트 생성
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <TextArea
                id="script"
                label="생성된 스크립트 (편집 가능)"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />

              {/* Premium Options */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50">
                <p className="text-sm font-semibold text-[#111827]">생성 옵션</p>

                {/* TTS Provider Selection */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[#6b7280]">음성 엔진</span>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-all text-sm',
                        ttsProvider === 'edge-tts'
                          ? 'border-[#1a5c2e] bg-white shadow-sm'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <input
                        type="radio"
                        name="tts-provider"
                        value="edge-tts"
                        checked={ttsProvider === 'edge-tts'}
                        onChange={() => setTtsProvider('edge-tts')}
                        className="accent-[#1a5c2e]"
                      />
                      <div>
                        <span className="font-medium text-[#111827]">edge-tts</span>
                        <span className="text-[#6b7280] ml-1">(무료)</span>
                      </div>
                    </label>
                    <label
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-all text-sm',
                        ttsProvider === 'elevenlabs'
                          ? 'border-amber-400 bg-amber-50 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <input
                        type="radio"
                        name="tts-provider"
                        value="elevenlabs"
                        checked={ttsProvider === 'elevenlabs'}
                        onChange={() => setTtsProvider('elevenlabs')}
                        className="accent-amber-500"
                      />
                      <div>
                        <span className="font-medium text-[#111827]">ElevenLabs</span>
                        <span className="text-amber-600 ml-1 text-xs font-semibold">PRO</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Image Generation Button */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={imageGenerating || imageGenerated || !contentId}
                    onClick={async () => {
                      if (!contentId) return;
                      setImageGenerating(true);
                      try {
                        await apiPost('/api/generate/image', { content_id: contentId });
                        setImageGenerated(true);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '이미지 생성 실패');
                      } finally {
                        setImageGenerating(false);
                      }
                    }}
                  >
                    {imageGenerating ? (
                      <>
                        <div className="w-3 h-3 border-2 border-[#1a5c2e] border-t-transparent rounded-full animate-spin" />
                        이미지 생성 중...
                      </>
                    ) : imageGenerated ? (
                      <>
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        썸네일 생성됨
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        DALL-E 3 썸네일 생성
                      </>
                    )}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={bgmGenerating || bgmGenerated || !contentId}
                    onClick={async () => {
                      if (!contentId) return;
                      setBgmGenerating(true);
                      try {
                        await apiPost('/api/generate/bgm', { content_id: contentId });
                        setBgmGenerated(true);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'BGM 생성 실패');
                      } finally {
                        setBgmGenerating(false);
                      }
                    }}
                  >
                    {bgmGenerating ? (
                      <>
                        <div className="w-3 h-3 border-2 border-[#1a5c2e] border-t-transparent rounded-full animate-spin" />
                        BGM 생성 중...
                      </>
                    ) : bgmGenerated ? (
                      <>
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        BGM 생성됨
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        BGM 생성 (Mubert AI)
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {!audioGenerated && (
                <div className="flex justify-end">
                  <Button onClick={handleGenerateTTS} disabled={loading}>
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        음성 생성 중...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        {ttsProvider === 'elevenlabs' ? '프리미엄 음성 생성 (ElevenLabs)' : '음성 생성 (edge-tts)'}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Step 3: Video Generation */}
      {currentStep === 3 && (
        <Card className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">영상 생성</h2>
            <p className="text-sm text-[#6b7280] mt-1">영상 타입을 선택하고 생성합니다</p>
          </div>

          {!videoPath ? (
            <div className="space-y-6">
              {/* Video Type Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={cn(
                    'relative flex flex-col rounded-xl border-2 p-4 cursor-pointer transition-all duration-200',
                    videoType === 'heygen'
                      ? 'border-[#1a5c2e] bg-green-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  )}
                >
                  <input
                    type="radio"
                    name="video-type"
                    value="heygen"
                    checked={videoType === 'heygen'}
                    onChange={() => setVideoType('heygen')}
                    className="sr-only"
                  />
                  {videoType === 'heygen' && (
                    <span className="absolute top-2 right-2 bg-[#1a5c2e] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      추천
                    </span>
                  )}
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      videoType === 'heygen' ? 'bg-[#1a5c2e]/10' : 'bg-gray-100'
                    )}>
                      <svg className={cn('w-5 h-5', videoType === 'heygen' ? 'text-[#1a5c2e]' : 'text-gray-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <span className={cn(
                      'font-semibold',
                      videoType === 'heygen' ? 'text-[#1a5c2e]' : 'text-[#111827]'
                    )}>
                      AI 아바타 (HeyGen)
                    </span>
                  </div>
                  <p className="text-xs text-[#6b7280]">
                    AI 전문가가 스크립트를 직접 읽는 영상을 생성합니다
                  </p>
                </label>

                <label
                  className={cn(
                    'relative flex flex-col rounded-xl border-2 p-4 cursor-pointer transition-all duration-200',
                    videoType === 'slideshow'
                      ? 'border-[#1a5c2e] bg-green-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  )}
                >
                  <input
                    type="radio"
                    name="video-type"
                    value="slideshow"
                    checked={videoType === 'slideshow'}
                    onChange={() => setVideoType('slideshow')}
                    className="sr-only"
                  />
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      videoType === 'slideshow' ? 'bg-[#1a5c2e]/10' : 'bg-gray-100'
                    )}>
                      <svg className={cn('w-5 h-5', videoType === 'slideshow' ? 'text-[#1a5c2e]' : 'text-gray-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span className={cn(
                      'font-semibold',
                      videoType === 'slideshow' ? 'text-[#1a5c2e]' : 'text-[#111827]'
                    )}>
                      AI 영상 (Runway + DALL-E)
                    </span>
                  </div>
                  <p className="text-xs text-[#6b7280]">
                    섹션별 AI 영상 클립을 생성하여 슬라이드쇼로 합성합니다
                  </p>
                </label>
              </div>

              {/* Avatar Selection (HeyGen only) */}
              {videoType === 'heygen' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#111827]">아바타 선택</span>
                    {avatarsLoading && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                        불러오는 중...
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[320px] overflow-y-auto pr-1">
                    {avatars.map((avatar) => (
                      <button
                        key={avatar.id}
                        type="button"
                        onClick={() => setSelectedAvatarId(avatar.id)}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all duration-200 text-left',
                          selectedAvatarId === avatar.id
                            ? 'border-[#1a5c2e] bg-green-50 shadow-md ring-2 ring-[#1a5c2e]/10'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        {/* Avatar icon or preview */}
                        <div className={cn(
                          'w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0',
                          avatar.category === 'custom'
                            ? 'bg-amber-100 text-amber-700'
                            : avatar.category === 'professional'
                              ? 'bg-blue-100 text-blue-700'
                              : avatar.category === 'casual'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-purple-100 text-purple-700'
                        )}>
                          {avatar.preview_url ? (
                            <img
                              src={avatar.preview_url}
                              alt={avatar.name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            avatar.name.charAt(0)
                          )}
                        </div>
                        <div className="text-center w-full min-w-0">
                          <p className={cn(
                            'text-xs font-medium truncate',
                            selectedAvatarId === avatar.id ? 'text-[#1a5c2e]' : 'text-[#111827]'
                          )}>
                            {avatar.name}
                          </p>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-1',
                            avatar.category === 'custom'
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-gray-100 text-gray-500'
                          )}>
                            {CATEGORY_LABELS[avatar.category] || avatar.category}
                          </span>
                        </div>
                        {selectedAvatarId === avatar.id && (
                          <div className="absolute top-1 right-1 w-5 h-5 bg-[#1a5c2e] rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  {avatars.length > 0 && (
                    <p className="text-xs text-[#6b7280]">
                      선택된 아바타: <span className="font-medium text-[#111827]">{avatars.find(a => a.id === selectedAvatarId)?.name || '기본'}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Generate Button */}
              <div className="text-center pt-2">
                <Button onClick={handleGenerateVideo} disabled={loading} size="lg">
                  {loading ? (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>
                        {videoType === 'heygen'
                          ? 'AI 아바타가 영상을 생성하고 있습니다... (약 2~3분 소요)'
                          : 'AI가 영상을 생성하고 있습니다... (섹션당 약 30초 소요)'}
                      </span>
                    </div>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {videoType === 'heygen' ? 'AI 아바타 영상 생성 (HeyGen)' : 'AI 영상 생성 (Runway + DALL-E)'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              {/* Success message */}
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 bg-[#22c55e] rounded-full flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-green-700 font-medium">영상이 성공적으로 생성되었습니다!</p>
              </div>

              {/* Video preview */}
              <div className="bg-black rounded-2xl overflow-hidden aspect-video flex items-center justify-center">
                <video
                  src={getFileUrl(videoPath)}
                  controls
                  className="w-full h-full"
                >
                  <track kind="captions" />
                  브라우저가 비디오를 지원하지 않습니다.
                </video>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <a
                  href={getFileUrl(videoPath)}
                  download
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#1a5c2e] hover:text-[#144723] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  영상 다운로드
                </a>
                <div className="flex-1" />
                <Button variant="secondary" onClick={() => router.push('/contents')}>
                  콘텐츠 목록으로
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const res = await apiGet<PlatformAccount[]>('/api/platforms');
                      if (res.data) setPlatformAccounts(res.data);
                    } catch {
                      // silent
                    }
                    setCurrentStep(4);
                  }}
                >
                  다음: 배포 예약
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Step 4: Publish Schedule */}
      {currentStep === 4 && (
        <Card className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">배포 예약</h2>
            <p className="text-sm text-[#6b7280] mt-1">플랫폼과 일정을 선택하여 배포를 예약합니다</p>
          </div>

          {publishDone ? (
            <div className="text-center py-8 space-y-5 animate-fade-in">
              <div className="w-16 h-16 bg-[#22c55e] rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-[#111827]">배포가 예약되었습니다!</p>
                <p className="text-sm text-[#6b7280] mt-1">배포 관리에서 상태를 확인하세요</p>
              </div>
              <div className="flex gap-3 justify-center pt-2">
                <Button variant="secondary" onClick={() => router.push('/contents')}>
                  콘텐츠 목록으로
                </Button>
                <Button onClick={() => router.push('/publish')}>
                  배포 관리로 이동
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Platform checkboxes */}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#111827]">플랫폼 선택</span>
                {platformAccounts.filter((a) => a.is_active).length === 0 ? (
                  <div className="text-sm text-[#6b7280] py-3 px-4 bg-gray-50 rounded-xl">
                    등록된 플랫폼 계정이 없습니다.{' '}
                    <a href="/settings" className="text-[#1a5c2e] hover:underline font-medium">
                      설정에서 추가
                    </a>
                    해주세요.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {platformAccounts
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
                              onChange={() =>
                                setSelectedAccounts((prev) =>
                                  prev.includes(account.id)
                                    ? prev.filter((id) => id !== account.id)
                                    : [...prev, account.id]
                                )
                              }
                              className="accent-[#1a5c2e]"
                            />
                            <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded', pm.color)}>
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
                <label htmlFor="publish-datetime" className="text-sm font-medium text-[#111827]">
                  예약 날짜/시간
                </label>
                <input
                  id="publish-datetime"
                  type="datetime-local"
                  value={publishScheduledAt}
                  onChange={(e) => setPublishScheduledAt(e.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 transition-all"
                />
              </div>

              {/* Caption */}
              <TextArea
                id="publish-caption"
                label="캡션 (선택)"
                value={publishCaption}
                onChange={(e) => setPublishCaption(e.target.value)}
                placeholder="게시물 캡션을 입력하세요..."
                className="min-h-[80px]"
              />

              <div className="flex justify-between pt-2">
                <Button variant="secondary" onClick={() => router.push('/contents')}>
                  건너뛰기
                </Button>
                <Button
                  onClick={async () => {
                    if (!contentId || selectedAccounts.length === 0 || !publishScheduledAt) return;
                    setError(null);
                    setLoading(true);
                    try {
                      if (selectedAccounts.length === 1) {
                        await apiPost('/api/publish', {
                          content_id: contentId,
                          platform_account_id: selectedAccounts[0],
                          scheduled_at: new Date(publishScheduledAt).toISOString(),
                          caption: publishCaption || undefined,
                        });
                      } else {
                        await apiPost('/api/publish', {
                          content_id: contentId,
                          platforms: selectedAccounts.map((id) => ({
                            platform_account_id: id,
                            scheduled_at: new Date(publishScheduledAt).toISOString(),
                            caption: publishCaption || undefined,
                          })),
                        });
                      }
                      setPublishDone(true);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : '배포 예약 실패');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading || selectedAccounts.length === 0 || !publishScheduledAt}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      예약 중...
                    </>
                  ) : (
                    '예약하기'
                  )}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
