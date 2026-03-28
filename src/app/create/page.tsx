'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import TextArea from '@/components/ui/TextArea';
import ProgressBar from '@/components/ui/ProgressBar';
import { apiGet, apiPost, apiPatch, getFileUrl } from '@/lib/api';
import {
  cn,
  contentTypeLabel,
  contentTypeDescription,
  videoLengthLabel,
  videoLengthDescription,
  shotTypeLabel,
  shotTypeDescription,
} from '@/lib/utils';
import type {
  Content,
  ContentType,
  Language,
  VideoLength,
  AdConfig,
  AdShot,
  ShotType,
  ScriptSection,
  PlatformAccount,
  Platform,
  VideoEngine,
  PlanningTemplate,
} from '@/types';

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

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTENT_TYPES: ContentType[] = ['health_info', 'recipe', 'nutrition_tip', 'product_ad', 'brand_ad'];
const AD_TYPES: ContentType[] = ['product_ad', 'brand_ad'];
const VIDEO_LENGTHS: VideoLength[] = [6, 15, 30, 60];

const AD_CHANNELS = [
  { value: 'instagram_reels', label: 'Instagram Reels' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube_shorts', label: 'YouTube Shorts' },
  { value: 'facebook', label: 'Facebook' },
];

const AD_CATEGORIES = [
  { value: 'bakery', label: '베이커리' },
  { value: 'beverage', label: '음료' },
  { value: 'snack', label: '스낵' },
  { value: 'supplement', label: '건강기능식품' },
  { value: 'other', label: '기타' },
];

const PLATFORM_META: Record<Platform, { label: string; color: string; icon: string }> = {
  instagram: { label: 'Instagram', color: 'bg-purple-100 text-purple-700', icon: 'IG' },
  youtube: { label: 'YouTube', color: 'bg-red-100 text-red-700', icon: 'YT' },
  tiktok: { label: 'TikTok', color: 'bg-gray-900 text-white', icon: 'TT' },
  facebook: { label: 'Facebook', color: 'bg-blue-100 text-blue-700', icon: 'FB' },
};

const SHOT_TYPE_ICONS: Record<ShotType, string> = {
  product_closeup: '📦',
  texture_macro: '🔍',
  lifestyle: '🌅',
  benefit_frame: '✨',
  endcard: '🎯',
};

const STEPS = [
  {
    number: 1,
    label: '기본 정보',
    subtitle: '콘텐츠 유형, 영상 길이, 주제를 설정합니다',
  },
  {
    number: 2,
    label: '스크립트 & 샷리스트',
    subtitle: 'AI가 스크립트와 촬영 구성을 생성합니다',
  },
  {
    number: 3,
    label: '키 비주얼 생성',
    subtitle: '각 섹션의 대표 이미지를 먼저 생성하고 확인합니다',
  },
  {
    number: 4,
    label: '영상 생성',
    subtitle: '확인된 이미지를 기반으로 영상을 제작합니다',
  },
  {
    number: 5,
    label: '배포 예약',
    subtitle: '플랫폼과 일정을 선택하여 배포를 예약합니다',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAdType(ct: ContentType): boolean {
  return AD_TYPES.includes(ct);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single shot card for ad preview */
function ShotCard({ shot, index }: { shot: AdShot | ScriptSection; index: number }) {
  // Normalize: AdShot uses .type/.prompt, ScriptSection uses .shot_type/.visual_prompt
  const isAdShot = 'type' in shot;
  const shotType: ShotType | undefined = isAdShot
    ? (shot as AdShot).type
    : (shot as ScriptSection).shot_type;
  const body = isAdShot ? (shot as AdShot).description : (shot as ScriptSection).body;
  const visualPrompt = isAdShot ? (shot as AdShot).prompt : (shot as ScriptSection).visual_prompt;
  const duration = isAdShot ? (shot as AdShot).duration : (shot as ScriptSection).duration_seconds;
  const shotNum = isAdShot ? (shot as AdShot).shot : index + 1;

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white hover:border-[#1a5c2e]/40 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 bg-[#1a5c2e] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
            {shotNum}
          </span>
          {shotType && (
            <div className="flex items-center gap-1.5">
              <span className="text-base" role="img" aria-label={shotType}>
                {SHOT_TYPE_ICONS[shotType]}
              </span>
              <span className="text-xs font-semibold text-[#1a5c2e] bg-green-50 px-2 py-0.5 rounded-full">
                {shotTypeLabel(shotType)}
              </span>
            </div>
          )}
        </div>
        <span className="text-xs font-mono text-white bg-[#1a5c2e] px-2 py-0.5 rounded-full shrink-0">
          {duration}s
        </span>
      </div>

      <p className="text-sm text-[#111827] mb-2 leading-relaxed">{body}</p>

      {shotType && (
        <p className="text-xs text-[#6b7280] italic">{shotTypeDescription(shotType)}</p>
      )}

      {visualPrompt && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-[#6b7280] font-medium mb-1">Visual Prompt</p>
          <p className="text-xs text-[#374151] font-mono bg-gray-50 rounded-lg p-2 leading-relaxed">
            {visualPrompt}
          </p>
        </div>
      )}
    </div>
  );
}

/** Inline text input with label */
function FieldInput({
  id,
  label,
  hint,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[#111827]">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-[#6b7280] -mt-0.5">{hint}</p>}
      <input
        id={id}
        className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] placeholder:text-gray-400 focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 transition-all"
        {...props}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);

  // ── Step 1 state ──
  const [contentType, setContentType] = useState<ContentType>('health_info');
  const [videoLength, setVideoLength] = useState<VideoLength>(60);
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState<Language>('ko');

  // ── Template state ──
  const [templates, setTemplates] = useState<PlanningTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');

  // ── Series state ──
  const [seriesEnabled, setSeriesEnabled] = useState(false);
  const [seriesName, setSeriesName] = useState('');
  const [seriesPrefix, setSeriesPrefix] = useState('EP');
  const [seriesEpisode, setSeriesEpisode] = useState(1);

  // ── Visual scenario (unified for entire video) ──
  const [visualScenario, setVisualScenario] = useState('');

  // Ad-specific fields (raw form state, converted to AdConfig on submit)
  const [adProductName, setAdProductName] = useState('');
  const [adCategory, setAdCategory] = useState('bakery');
  const [adBenefitsRaw, setAdBenefitsRaw] = useState('');
  const [adTargetAudience, setAdTargetAudience] = useState('');
  const [adTone, setAdTone] = useState('');
  const [adChannels, setAdChannels] = useState<string[]>([]);
  const [adConstraintsRaw, setAdConstraintsRaw] = useState('');

  // ── Created content ──
  const [contentId, setContentId] = useState<number | null>(null);

  // ── Step 2 state ──
  const [script, setScript] = useState('');
  const [sections, setSections] = useState<ScriptSection[]>([]);
  const [scriptSections, setScriptSections] = useState<ScriptSection[]>([]);
  const [shots, setShots] = useState<AdShot[]>([]);
  const [hooks, setHooks] = useState<string[]>([]);
  const [ctaOptions, setCtaOptions] = useState<string[]>([]);
  const [selectedHook, setSelectedHook] = useState('');
  const [selectedCta, setSelectedCta] = useState('');
  const [scriptGenerated, setScriptGenerated] = useState(false);
  const [audioGenerated, setAudioGenerated] = useState(false);
  const [ttsProvider, setTtsProvider] = useState<'edge-tts' | 'elevenlabs'>('edge-tts');
  const [imageGenerated, setImageGenerated] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [bgmGenerated, setBgmGenerated] = useState(false);
  const [bgmGenerating, setBgmGenerating] = useState(false);
  const [sectionsDirty, setSectionsDirty] = useState(false);
  const [sectionsSaving, setSectionsSaving] = useState(false);

  // ── Step 3 state (Key Visuals) ──
  const [keyVisuals, setKeyVisuals] = useState<Array<{ sectionIndex: number; imageUrl: string | null; generating: boolean }>>([]);
  const [keyVisualsReady, setKeyVisualsReady] = useState(false);

  // ── Step 4 state (Video) ──
  const [videoType, setVideoType] = useState<'slideshow' | 'heygen'>('heygen');
  const [videoEngine, setVideoEngine] = useState<VideoEngine>('kling');
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(DEFAULT_AVATAR_ID);
  const [avatarsLoading, setAvatarsLoading] = useState(false);
  const [videoProgressMessage, setVideoProgressMessage] = useState<string | null>(null);
  const [videoProgressPercent, setVideoProgressPercent] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Step 4 state ──
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [publishScheduledAt, setPublishScheduledAt] = useState('');
  const [publishCaption, setPublishCaption] = useState('');
  const [publishDone, setPublishDone] = useState(false);

  // ── Loading & error ──
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
    if (currentStep === 4 && videoType === 'heygen') {
      loadAvatars();
    }
  }, [currentStep, videoType, loadAvatars]);

  // Load templates on mount
  useEffect(() => {
    apiGet<PlanningTemplate[]>('/api/templates')
      .then((res) => { if (res.data) setTemplates(res.data); })
      .catch(() => {});
  }, []);

  // Apply template to form
  function applyTemplate(tpl: PlanningTemplate) {
    setSelectedTemplateId(tpl.id);
    setContentType(tpl.content_type);
    setVideoLength(tpl.video_length);
    setLanguage(tpl.language);
    if (tpl.visual_scenario) setVisualScenario(tpl.visual_scenario);
    if (tpl.series_enabled) {
      setSeriesEnabled(true);
      setSeriesName(tpl.series_name || '');
      setSeriesPrefix(tpl.series_prefix || 'EP');
    }
    if (tpl.ad_config) {
      setAdProductName(tpl.ad_config.product_name || '');
      setAdCategory(tpl.ad_config.category || 'bakery');
      setAdBenefitsRaw(tpl.ad_config.benefits?.join(', ') || '');
      setAdTargetAudience(tpl.ad_config.target_audience || '');
      setAdTone(tpl.ad_config.tone || '');
      setAdChannels(tpl.ad_config.channels || []);
      setAdConstraintsRaw(tpl.ad_config.constraints?.join(', ') || '');
    }
  }

  // Save current settings as template
  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    try {
      const adConfig = isAdType(contentType) ? buildAdConfig() : undefined;
      const res = await apiPost<PlanningTemplate>('/api/templates', {
        name: templateName,
        description: templateDesc,
        content_type: contentType,
        video_length: videoLength,
        language,
        ad_config: adConfig,
        visual_scenario: visualScenario,
        tone_keywords: adConfig?.tone ? adConfig.tone.split(',').map((s: string) => s.trim()) : [],
        series_enabled: seriesEnabled,
        series_name: seriesEnabled ? seriesName : undefined,
        series_prefix: seriesEnabled ? seriesPrefix : undefined,
      });
      if (res.data) {
        setTemplates((prev) => [...prev, res.data!]);
        setSelectedTemplateId(res.data.id);
        setShowTemplateSave(false);
        setTemplateName('');
        setTemplateDesc('');
      }
    } catch {
      setError('템플릿 저장 실패');
    }
  }

  const progressPercent = ((currentStep - 1) / STEPS.length) * 100;
  const isAd = isAdType(contentType);

  // ── Derived ad config ──
  function buildAdConfig(): AdConfig {
    return {
      product_name: adProductName,
      category: adCategory,
      benefits: adBenefitsRaw.split(',').map((s) => s.trim()).filter(Boolean),
      target_audience: adTargetAudience,
      tone: adTone,
      video_length_sec: videoLength,
      channels: adChannels,
      constraints: adConstraintsRaw.split(',').map((s) => s.trim()).filter(Boolean),
    };
  }

  // ── When content type changes, adjust default video length ──
  function handleContentTypeChange(ct: ContentType) {
    setContentType(ct);
    if (AD_TYPES.includes(ct)) {
      setVideoLength(15);
    } else {
      setVideoLength(60);
    }
  }

  // ── Channel checkbox toggle ──
  function toggleChannel(ch: string) {
    setAdChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  // ── Step 1: Create content ──
  async function handleStep1Submit() {
    if (!topic.trim()) {
      setError('주제를 입력해주세요.');
      return;
    }
    if (isAd && !adProductName.trim()) {
      setError('제품명을 입력해주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const adConfig = isAd ? buildAdConfig() : undefined;
      const res = await apiPost<Content>('/api/contents', {
        title: topic,
        content_type: contentType,
        language,
        video_length: videoLength,
        ...(adConfig ? { ad_config: adConfig } : {}),
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

  // ── Step 2: Generate script ──
  async function handleGenerateScript() {
    if (!contentId) return;
    setError(null);
    setLoading(true);
    try {
      const adConfig = isAd ? buildAdConfig() : undefined;
      const res = await apiPost<{
        fullScript: string;
        sections?: ScriptSection[];
        shots?: AdShot[];
        hooks?: string[];
        cta_options?: string[];
        visualScenario?: string;
      }>('/api/generate/script', {
        content_id: contentId,
        topic,
        video_length: videoLength,
        ...(adConfig ? { ad_config: adConfig } : {}),
        ...(visualScenario ? { visual_scenario: visualScenario } : {}),
        ...(seriesEnabled && seriesName ? { series_info: { name: seriesName, episode: seriesEpisode, prefix: seriesPrefix } } : {}),
      });
      if (res.data) {
        setScript(res.data.fullScript ?? '');
        setSections(res.data.sections ?? []);
        setScriptSections(res.data.sections ?? []);
        setShots(res.data.shots ?? []);
        setHooks(res.data.hooks ?? []);
        setCtaOptions(res.data.cta_options ?? []);
        if (res.data.visualScenario) setVisualScenario(res.data.visualScenario);
        if (res.data.hooks?.length) setSelectedHook(res.data.hooks[0]);
        if (res.data.cta_options?.length) setSelectedCta(res.data.cta_options[0]);
        setScriptGenerated(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '스크립트 생성 실패');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Generate TTS ──
  async function handleGenerateTTS() {
    if (!contentId) return;
    setError(null);
    setLoading(true);
    try {
      // Save edited sections/script before TTS generation
      if (sectionsDirty || scriptSections.length > 0) {
        const fullScript = scriptSections.length > 0
          ? scriptSections.sort((a, b) => a.order - b.order).map(s => s.body).join('\n\n')
          : script;
        setScript(fullScript);
        await apiPatch(`/api/contents/${contentId}`, {
          script: fullScript,
          sections: scriptSections.length > 0 ? scriptSections : undefined,
        });
        setSectionsDirty(false);
      }

      await apiPost('/api/generate/tts', {
        content_id: contentId,
        tts_provider: ttsProvider,
      });
      setAudioGenerated(true);
      // Initialize key visuals for each section
      const secs = scriptSections.length > 0 ? scriptSections : sections;
      setKeyVisuals(secs.map((_, idx) => ({ sectionIndex: idx, imageUrl: null, generating: false })));
      setCurrentStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : '음성 생성 실패');
    } finally {
      setLoading(false);
    }
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // ── Step 4: Generate video (async with polling) ──
  async function handleGenerateVideo() {
    if (!contentId) return;
    setError(null);
    setLoading(true);
    setVideoProgressMessage('영상 생성을 시작하는 중...');
    setVideoProgressPercent(0);

    try {
      const isHeygen = videoType === 'heygen';
      const statusUrl = isHeygen
        ? `/api/generate/heygen/status?content_id=${contentId}`
        : `/api/generate/video/status?content_id=${contentId}`;

      if (isHeygen) {
        // HeyGen AI avatar video - fire async request
        await apiPost('/api/generate/heygen', {
          content_id: contentId,
          avatar_id: selectedAvatarId,
        });
      } else {
        // Slideshow (Image-to-Video) - pass pre-generated key visual URLs
        const secs = scriptSections.length > 0 ? scriptSections : sections;
        const sectionsWithImages = secs.map((s, idx) => ({
          body: s.body,
          visual_prompt: s.visual_prompt,
          duration_seconds: s.duration_seconds,
          image_url: keyVisuals[idx]?.imageUrl || undefined,
        }));
        await apiPost('/api/generate/video', {
          content_id: contentId,
          video_engine: videoEngine,
          generate_images: !keyVisualsReady, // skip DALL-E if we already have images
          sections: sectionsWithImages,
        });
      }

      // Start polling for status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await apiGet<{
            status: 'processing' | 'completed' | 'failed';
            progress: string | null;
            current_section: number | null;
            total_sections: number | null;
            video_path: string | null;
            error: string | null;
          }>(statusUrl);

          if (statusRes.data) {
            const { status, progress, current_section, total_sections, video_path, error: taskError } = statusRes.data;

            if (status === 'completed') {
              // Stop polling
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              if (video_path) {
                setVideoPath(video_path);
              }
              setVideoProgressMessage(null);
              setVideoProgressPercent(100);
              setLoading(false);
            } else if (status === 'failed') {
              // Stop polling
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setError(taskError || '영상 생성 실패');
              setVideoProgressMessage(null);
              setVideoProgressPercent(0);
              setLoading(false);
            } else {
              // Still processing - update progress
              if (progress) {
                setVideoProgressMessage(progress);
              }
              if (current_section != null && total_sections != null && total_sections > 0) {
                setVideoProgressPercent(Math.round((current_section / total_sections) * 100));
              }
            }
          }
        } catch {
          // Polling error - don't stop, just retry next interval
          console.warn('[Video] Status polling error, will retry...');
        }
      }, 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '영상 생성 요청 실패');
      setVideoProgressMessage(null);
      setLoading(false);
    }
  }

  // ── Step 4: Publish ──
  async function handlePublish() {
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
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">

      {/* ── Stepper ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between mb-6 gap-2">
          {STEPS.map((step, idx) => (
            <div key={step.number} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 shrink-0">
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
              </div>

              <div className="ml-2 min-w-0 hidden sm:block pt-0.5">
                <p
                  className={cn(
                    'text-sm font-semibold truncate',
                    currentStep >= step.number ? 'text-[#111827]' : 'text-gray-400'
                  )}
                >
                  {step.label}
                </p>
                <p
                  className={cn(
                    'text-xs leading-tight mt-0.5',
                    currentStep === step.number
                      ? 'text-[#6b7280]'
                      : 'text-gray-300'
                  )}
                >
                  {step.subtitle}
                </p>
              </div>

              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-[2px] mx-3 mt-4 rounded-full transition-colors duration-300 shrink-0 hidden sm:block',
                    currentStep > step.number ? 'bg-[#22c55e]' : 'bg-gray-100'
                  )}
                />
              )}
            </div>
          ))}
        </div>
        <ProgressBar value={progressPercent} />
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-fade-in">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          STEP 1: 기본 정보 & 제품 데이터
          ════════════════════════════════════════════════════════ */}
      {currentStep === 1 && (
        <Card className="space-y-8 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">기본 정보 입력</h2>
            <p className="text-sm text-[#6b7280] mt-1">
              콘텐츠 유형과 영상 길이를 선택하고 주제를 입력해주세요
            </p>
          </div>

          {/* ── Template Selector ── */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#111827]">기획 템플릿 불러오기</label>
              <p className="text-xs text-[#6b7280]">저장된 템플릿을 선택하면 유형, 길이, 제품 정보, 시나리오가 자동으로 채워집니다</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className={cn(
                      'text-left rounded-xl border px-4 py-3 transition-all duration-200',
                      selectedTemplateId === tpl.id
                        ? 'border-[#1a5c2e] bg-green-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={cn('text-sm font-semibold', selectedTemplateId === tpl.id ? 'text-[#1a5c2e]' : 'text-[#111827]')}>
                        {tpl.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] bg-gray-100 text-[#6b7280] px-1.5 py-0.5 rounded-full">
                          {contentTypeLabel(tpl.content_type)}
                        </span>
                        <span className="text-[10px] bg-gray-100 text-[#6b7280] px-1.5 py-0.5 rounded-full">
                          {tpl.video_length}초
                        </span>
                        {tpl.series_enabled && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">시리즈</span>
                        )}
                      </div>
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-[#6b7280] line-clamp-1">{tpl.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Content Type ── */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#111827]">
              콘텐츠 유형 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CONTENT_TYPES.map((ct) => {
                const selected = contentType === ct;
                return (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => handleContentTypeChange(ct)}
                    className={cn(
                      'text-left rounded-xl border px-4 py-3 transition-all duration-200',
                      selected
                        ? 'border-[#1a5c2e] bg-green-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={cn('text-sm font-semibold', selected ? 'text-[#1a5c2e]' : 'text-[#111827]')}>
                        {contentTypeLabel(ct)}
                      </span>
                      {AD_TYPES.includes(ct) && (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          AD
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6b7280] leading-tight">
                      {contentTypeDescription(ct)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Video Length ── */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#111827]">
              영상 길이 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {VIDEO_LENGTHS.map((vl) => {
                const selected = videoLength === vl;
                return (
                  <button
                    key={vl}
                    type="button"
                    onClick={() => setVideoLength(vl)}
                    className={cn(
                      'text-left rounded-xl border px-3 py-3 transition-all duration-200',
                      selected
                        ? 'border-[#1a5c2e] bg-green-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <p className={cn('text-sm font-bold mb-1', selected ? 'text-[#1a5c2e]' : 'text-[#111827]')}>
                      {videoLengthLabel(vl)}
                    </p>
                    <p className="text-xs text-[#6b7280] leading-tight">
                      {videoLengthDescription(vl)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Topic ── */}
          <FieldInput
            id="topic"
            label="주제"
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={
              isAd
                ? '예: 출시 신제품 홍보, 시즌 한정 캠페인'
                : '예: 봄철 면역력 높이는 음식 5가지'
            }
            hint="AI가 이 주제를 바탕으로 스크립트를 작성합니다"
          />

          {/* ── Language ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#111827]">언어</label>
            <div className="grid grid-cols-2 gap-2">
              {(['ko', 'en'] as Language[]).map((lang) => (
                <label
                  key={lang}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-4 py-2.5 cursor-pointer transition-all',
                    language === lang
                      ? 'border-[#1a5c2e] bg-green-50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <input
                    type="radio"
                    name="language"
                    value={lang}
                    checked={language === lang}
                    onChange={() => setLanguage(lang)}
                    className="accent-[#1a5c2e]"
                  />
                  <span className="text-sm font-medium text-[#111827]">
                    {lang === 'ko' ? '한국어' : 'English'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Ad-specific Product Data (conditional) ── */}
          {isAd && (
            <div className="space-y-5 border-t border-dashed border-[#1a5c2e]/20 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-[#1a5c2e] flex items-center gap-2">
                  <span className="w-5 h-5 bg-[#1a5c2e] text-white rounded flex items-center justify-center text-xs">AD</span>
                  제품 데이터
                </h3>
                <p className="text-xs text-[#6b7280] mt-1">
                  광고 유형에서는 제품 정보가 필요합니다. AI가 제품의 특성에 맞는 샷 구성과 스크립트를 생성합니다.
                </p>
              </div>

              {/* Product name + Category */}
              <div className="grid sm:grid-cols-2 gap-4">
                <FieldInput
                  id="ad-product-name"
                  label="제품명"
                  required
                  value={adProductName}
                  onChange={(e) => setAdProductName(e.target.value)}
                  placeholder="예: 그린 오트 단백질바"
                />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ad-category" className="text-sm font-medium text-[#111827]">
                    카테고리
                  </label>
                  <select
                    id="ad-category"
                    value={adCategory}
                    onChange={(e) => setAdCategory(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#111827] focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 transition-all"
                  >
                    {AD_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Benefits */}
              <FieldInput
                id="ad-benefits"
                label="제품 핵심 혜택"
                value={adBenefitsRaw}
                onChange={(e) => setAdBenefitsRaw(e.target.value)}
                placeholder="예: 고단백 20g, 저당 3g, 글루텐프리"
                hint="쉼표로 구분하여 입력하세요"
              />

              {/* Target audience */}
              <FieldInput
                id="ad-target"
                label="타겟 고객"
                value={adTargetAudience}
                onChange={(e) => setAdTargetAudience(e.target.value)}
                placeholder="예: 20-30대 헬스 관심 여성, 직장인"
              />

              {/* Tone */}
              <FieldInput
                id="ad-tone"
                label="톤 & 무드"
                value={adTone}
                onChange={(e) => setAdTone(e.target.value)}
                placeholder="예: 프리미엄, 미니멀, 식욕자극"
                hint="광고의 전반적인 분위기를 자유롭게 입력하세요"
              />

              {/* Channels */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#111827]">타겟 채널</label>
                <p className="text-xs text-[#6b7280]">광고를 배포할 플랫폼을 선택하세요 (복수 선택 가능)</p>
                <div className="grid grid-cols-2 gap-2">
                  {AD_CHANNELS.map((ch) => {
                    const checked = adChannels.includes(ch.value);
                    return (
                      <label
                        key={ch.value}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-all',
                          checked
                            ? 'border-[#1a5c2e] bg-green-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChannel(ch.value)}
                          className="accent-[#1a5c2e]"
                        />
                        <span className="text-sm text-[#111827]">{ch.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Constraints */}
              <FieldInput
                id="ad-constraints"
                label="촬영 제약 사항"
                value={adConstraintsRaw}
                onChange={(e) => setAdConstraintsRaw(e.target.value)}
                placeholder="예: 패키지 왜곡 금지, 얼굴 최소화"
                hint="쉼표로 구분하여 입력하세요"
              />
            </div>
          )}

          {/* ── Visual Scenario (unified) ── */}
          <div className="space-y-2">
            <label htmlFor="visual-scenario" className="text-sm font-medium text-[#111827]">
              영상 시나리오
              <span className="text-xs text-[#6b7280] font-normal ml-2">(전체 영상에 적용될 하나의 비주얼 컨셉)</span>
            </label>
            <p className="text-xs text-[#6b7280]">
              이 시나리오가 영상 전체의 분위기, 조명, 카메라 앵글을 결정합니다. 비워두면 AI가 자동 생성합니다.
            </p>
            <textarea
              id="visual-scenario"
              value={visualScenario}
              onChange={(e) => setVisualScenario(e.target.value)}
              placeholder="예: Premium food photography style, warm studio lighting, clean white marble table, soft depth of field, vertical 9:16 format, no text overlay"
              className="w-full rounded-xl border border-amber-200 bg-amber-50/30 px-4 py-3 text-sm text-[#374151] font-mono placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/10 transition-all resize-y min-h-[80px]"
            />
          </div>

          {/* ── Series Settings ── */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#111827]">시리즈(연속물) 설정</p>
                <p className="text-xs text-[#6b7280] mt-0.5">같은 컨셉으로 에피소드별 영상을 이어서 제작합니다</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={seriesEnabled}
                  onChange={(e) => setSeriesEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1a5c2e]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1a5c2e]" />
              </label>
            </div>
            {seriesEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="sm:col-span-2">
                  <FieldInput
                    id="series-name"
                    label="시리즈명"
                    value={seriesName}
                    onChange={(e) => setSeriesName(e.target.value)}
                    placeholder="예: 널담 건강 시리즈"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FieldInput
                    id="series-prefix"
                    label="접두사"
                    value={seriesPrefix}
                    onChange={(e) => setSeriesPrefix(e.target.value)}
                    placeholder="EP"
                  />
                  <FieldInput
                    id="series-episode"
                    label="회차"
                    type="number"
                    min={1}
                    value={seriesEpisode}
                    onChange={(e) => setSeriesEpisode(parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Next button ── */}
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

      {/* ════════════════════════════════════════════════════════
          STEP 2: 스크립트 & 샷리스트
          ════════════════════════════════════════════════════════ */}
      {currentStep === 2 && (
        <Card className="space-y-6 animate-fade-in">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#111827]">스크립트 & 샷리스트</h2>
              <p className="text-sm text-[#6b7280] mt-1">
                {isAd
                  ? 'AI가 광고 샷 구성, 훅, CTA를 포함한 스크립트를 생성합니다'
                  : 'AI가 주제에 맞는 섹션별 스크립트를 작성합니다'}
              </p>
              {seriesEnabled && seriesName && (
                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  시리즈: {seriesName} &middot; {seriesPrefix}{seriesEpisode}
                </p>
              )}
            </div>
            {/* Save as template button */}
            {scriptGenerated && (
              <button
                type="button"
                onClick={() => setShowTemplateSave(!showTemplateSave)}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-[#1a5c2e] bg-green-50 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                템플릿으로 저장
              </button>
            )}
          </div>

          {/* ── Save as template form ── */}
          {showTemplateSave && (
            <div className="border border-green-200 rounded-xl p-4 bg-green-50/50 space-y-3 animate-fade-in">
              <p className="text-sm font-medium text-[#1a5c2e]">현재 설정을 기획 템플릿으로 저장</p>
              <p className="text-xs text-[#6b7280]">다음에 같은 설정으로 빠르게 시작하거나 시리즈 연속물로 제작할 수 있습니다</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldInput
                  id="template-name"
                  label="템플릿 이름"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="예: 널담 15초 제품 광고"
                  required
                />
                <FieldInput
                  id="template-desc"
                  label="설명 (선택)"
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="예: 고단백 베이글 시리즈용"
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSaveTemplate} disabled={!templateName.trim()}>
                  저장
                </Button>
              </div>
            </div>
          )}

          {/* ── Before generation: generate button ── */}
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
                  &quot;{topic}&quot; 주제 &middot; {videoLengthLabel(videoLength)} &middot; {contentTypeLabel(contentType)}
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
            <div className="space-y-6">
              {/* Sections editor from master (visual_prompt editing) */}
              {scriptSections.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-[#111827]">스크립트 (섹션별 편집)</label>
                    {sectionsDirty && (
                      <button
                        type="button"
                        disabled={sectionsSaving}
                        onClick={async () => {
                          if (!contentId) return;
                          setSectionsSaving(true);
                          try {
                            const fullScript = scriptSections
                              .sort((a, b) => a.order - b.order)
                              .map(s => s.body)
                              .join('\n\n');
                            setScript(fullScript);
                            await apiPatch(`/api/contents/${contentId}`, {
                              script: fullScript,
                              sections: scriptSections,
                            });
                            setSectionsDirty(false);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : '저장 실패');
                          } finally {
                            setSectionsSaving(false);
                          }
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all',
                          sectionsSaving
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-[#1a5c2e] text-white hover:bg-[#144723] shadow-sm'
                        )}
                      >
                        {sectionsSaving ? (
                          <>
                            <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                            저장 중...
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            변경사항 저장
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {scriptSections
                    .sort((a, b) => a.order - b.order)
                    .map((section, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-100">
                        <span className="text-xs font-semibold text-[#374151]">
                          {section.order}. {section.title}
                        </span>
                        <span className="text-xs text-[#6b7280]">{section.duration_seconds}s</span>
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <p className="text-xs font-medium text-[#6b7280] mb-1">나레이션</p>
                          <textarea
                            value={section.body}
                            onChange={(e) => {
                              const updated = [...scriptSections];
                              updated[idx] = { ...updated[idx], body: e.target.value };
                              setScriptSections(updated);
                              setSectionsDirty(true);
                            }}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#111827] leading-relaxed focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 transition-all resize-y min-h-[60px]"
                          />
                        </div>
                        {section.visual_description && (
                          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                            <p className="text-xs font-medium text-blue-600 mb-1 flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              시각 설명 (참고용)
                            </p>
                            <p className="text-xs text-blue-800">{section.visual_description}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Full script textarea (fallback when no sections) */}
              {scriptSections.length === 0 && (
                <TextArea
                  id="script"
                  label="전체 나레이션 대본 (편집 가능 - TTS가 읽을 텍스트)"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                />
              )}

              {/* ── Unified Visual Scenario ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <h3 className="text-sm font-semibold text-[#111827]">영상 시나리오</h3>
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">전체 영상 1개</span>
                </div>
                <p className="text-xs text-[#6b7280]">
                  이 시나리오 하나가 영상 전체의 비주얼 스타일을 결정합니다. 편집하여 원하는 분위기로 조정하세요.
                </p>
                <textarea
                  value={visualScenario}
                  onChange={(e) => setVisualScenario(e.target.value)}
                  placeholder="AI가 생성한 시나리오가 여기에 표시됩니다..."
                  className="w-full rounded-xl border border-amber-200 bg-amber-50/30 px-4 py-3 text-sm text-[#374151] font-mono placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/10 transition-all resize-y min-h-[100px]"
                />
              </div>

              {/* ── Shot list (for ads or short-form <=30s) ── */}
              {(isAd || videoLength <= 30) && shots.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#111827]">샷 리스트</h3>
                    <span className="text-xs text-[#6b7280] bg-gray-100 px-2 py-0.5 rounded-full">
                      {shots.length}개 샷 &middot; 총 {shots.reduce((sum, s) => sum + s.duration, 0)}초
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {shots.map((shot, idx) => (
                      <ShotCard key={shot.shot} shot={shot} index={idx} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Section-based script (for content type or long-form) ── */}
              {(!isAd && videoLength > 30) && sections.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-[#111827]">섹션별 구성</h3>
                  <div className="grid gap-3">
                    {sections.map((sec, idx) => (
                      <ShotCard key={sec.order} shot={sec} index={idx} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Hooks (selectable cards) ── */}
              {hooks.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#111827]">훅 옵션</h3>
                    <p className="text-xs text-[#6b7280] mt-0.5">영상 첫 1-2초를 사로잡는 문장을 선택하세요</p>
                  </div>
                  <div className="grid gap-2">
                    {hooks.map((hook) => (
                      <button
                        key={hook}
                        type="button"
                        onClick={() => setSelectedHook(hook)}
                        className={cn(
                          'text-left rounded-xl border px-4 py-3 text-sm transition-all',
                          selectedHook === hook
                            ? 'border-[#1a5c2e] bg-green-50 text-[#1a5c2e] font-medium shadow-sm'
                            : 'border-gray-200 text-[#374151] hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        <span className="text-xs text-[#6b7280] mr-1.5 font-mono">훅</span>
                        {hook}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── CTA options (selectable pills) ── */}
              {ctaOptions.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#111827]">CTA 옵션</h3>
                    <p className="text-xs text-[#6b7280] mt-0.5">영상 마지막에 사용할 행동 유도 문구를 선택하세요</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ctaOptions.map((cta) => (
                      <button
                        key={cta}
                        type="button"
                        onClick={() => setSelectedCta(cta)}
                        className={cn(
                          'rounded-full border px-4 py-1.5 text-sm transition-all',
                          selectedCta === cta
                            ? 'border-[#1a5c2e] bg-[#1a5c2e] text-white font-medium shadow-sm'
                            : 'border-gray-200 text-[#374151] hover:border-[#1a5c2e]/40 hover:bg-green-50'
                        )}
                      >
                        {cta}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Voiceover script textarea ── */}
              <div className="space-y-1.5">
                <label htmlFor="script" className="text-sm font-semibold text-[#111827]">
                  보이스오버 스크립트
                  <span className="text-xs text-[#6b7280] font-normal ml-2">(직접 편집 가능)</span>
                </label>
                <textarea
                  id="script"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#111827] font-mono placeholder:text-gray-400 focus:border-[#1a5c2e] focus:outline-none focus:ring-2 focus:ring-[#1a5c2e]/10 transition-all resize-none"
                />
              </div>

              {/* ── Options panel ── */}
              <div className="border border-gray-200 rounded-xl p-5 space-y-5 bg-gray-50">
                <p className="text-sm font-semibold text-[#111827]">음성 & 에셋 옵션</p>

                {/* TTS Provider */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[#6b7280]">음성 엔진</span>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-all text-sm',
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
                        <span className="text-[#6b7280] ml-1 text-xs">(무료)</span>
                      </div>
                    </label>
                    <label
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-all text-sm',
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
                        <span className="text-amber-600 ml-1.5 text-xs font-bold">PRO</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Asset generation buttons */}
                <div className="flex flex-wrap gap-2">
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

              {/* ── Generate TTS / Proceed ── */}
              {!audioGenerated && (
                <div className="flex justify-end pt-1">
                  <Button onClick={handleGenerateTTS} disabled={loading} size="lg">
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
                        {ttsProvider === 'elevenlabs'
                          ? '프리미엄 음성 생성 (ElevenLabs)'
                          : '음성 생성 (edge-tts)'}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════
          STEP 3: 키 비주얼 생성
          ════════════════════════════════════════════════════════ */}
      {currentStep === 3 && (
        <Card className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">키 비주얼 생성</h2>
            <p className="text-sm text-[#6b7280] mt-1">
              각 섹션의 대표 이미지를 먼저 생성합니다. 이미지를 확인하고 마음에 들면 영상 생성으로 넘어가세요.
            </p>
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              이미지를 먼저 고정하면 영상의 변화 폭이 줄어들어 일관된 결과물을 얻을 수 있습니다.
            </p>
          </div>

          {/* Visual Scenario (read-only summary) */}
          {visualScenario && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-medium text-amber-700 mb-1">적용 중인 영상 시나리오</p>
              <p className="text-xs text-amber-800 font-mono leading-relaxed">{visualScenario}</p>
            </div>
          )}

          {/* Section-by-section image generation */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#111827]">
                섹션별 키 비주얼
                <span className="text-xs text-[#6b7280] font-normal ml-2">
                  ({keyVisuals.filter((kv) => kv.imageUrl).length}/{keyVisuals.length} 완료)
                </span>
              </h3>
              <Button
                size="sm"
                disabled={loading || keyVisuals.every((kv) => kv.generating)}
                onClick={async () => {
                  const secs = scriptSections.length > 0 ? scriptSections : sections;
                  setLoading(true);
                  setError(null);
                  for (let i = 0; i < secs.length; i++) {
                    if (keyVisuals[i]?.imageUrl) continue; // skip already generated
                    setKeyVisuals((prev) =>
                      prev.map((kv, idx) => idx === i ? { ...kv, generating: true } : kv)
                    );
                    try {
                      const sec = secs[i];
                      const prompt = visualScenario
                        ? `${visualScenario}. Scene: ${sec.visual_description || sec.title}`
                        : `Korean health food brand commercial shot. ${sec.visual_description || sec.title}. Premium food photography, clean background, vertical 9:16 format.`;
                      const res = await apiPost<{ imagePath: string; imageUrl: string }>('/api/generate/image', {
                        content_id: contentId,
                        prompt,
                        size: '1024x1792',
                        section_index: i,
                      });
                      const imgPath = res.data?.imagePath || res.data?.imageUrl;
                      if (imgPath) {
                        setKeyVisuals((prev) =>
                          prev.map((kv, idx) => idx === i ? { ...kv, imageUrl: imgPath, generating: false } : kv)
                        );
                      } else {
                        setKeyVisuals((prev) =>
                          prev.map((kv, idx) => idx === i ? { ...kv, generating: false } : kv)
                        );
                      }
                    } catch (err) {
                      setKeyVisuals((prev) =>
                        prev.map((kv, idx) => idx === i ? { ...kv, generating: false } : kv)
                      );
                      setError(`섹션 ${i + 1} 이미지 생성 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
                    }
                  }
                  setLoading(false);
                  setKeyVisualsReady(true);
                }}
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    이미지 생성 중...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    전체 이미지 일괄 생성
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {keyVisuals.map((kv, idx) => {
                const secs = scriptSections.length > 0 ? scriptSections : sections;
                const sec = secs[idx];
                if (!sec) return null;
                return (
                  <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                    {/* Section header */}
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#374151]">
                        {sec.order || idx + 1}. {sec.title}
                      </span>
                      <span className="text-[10px] text-[#6b7280] bg-gray-100 px-1.5 py-0.5 rounded-full">
                        {sec.duration_seconds}초
                      </span>
                    </div>

                    {/* Image area */}
                    <div className="aspect-[9/16] bg-gray-100 relative flex items-center justify-center max-h-[280px]">
                      {kv.imageUrl ? (
                        <img
                          src={getFileUrl(kv.imageUrl)}
                          alt={`섹션 ${idx + 1} 키 비주얼`}
                          className="w-full h-full object-cover"
                        />
                      ) : kv.generating ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#22c55e] rounded-full animate-spin" />
                          <p className="text-xs text-[#6b7280]">생성 중...</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-300">
                          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-xs">미생성</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="p-3 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={kv.generating || loading}
                        onClick={async () => {
                          setKeyVisuals((prev) =>
                            prev.map((k, i) => i === idx ? { ...k, generating: true } : k)
                          );
                          try {
                            const prompt = visualScenario
                              ? `${visualScenario}. Scene: ${sec.visual_description || sec.title}`
                              : `Korean health food brand commercial shot. ${sec.visual_description || sec.title}. Premium food photography.`;
                            const res = await apiPost<{ imagePath: string; imageUrl: string }>('/api/generate/image', {
                              content_id: contentId,
                              prompt,
                              size: '1024x1792',
                              section_index: idx,
                            });
                            const imgPath = res.data?.imagePath || res.data?.imageUrl;
                            if (imgPath) {
                              setKeyVisuals((prev) =>
                                prev.map((k, i) => i === idx ? { ...k, imageUrl: imgPath, generating: false } : k)
                              );
                            } else {
                              setKeyVisuals((prev) =>
                                prev.map((k, i) => i === idx ? { ...k, generating: false } : k)
                              );
                            }
                          } catch {
                            setKeyVisuals((prev) =>
                              prev.map((k, i) => i === idx ? { ...k, generating: false } : k)
                            );
                          }
                        }}
                        className="text-xs text-[#1a5c2e] hover:text-[#144723] font-medium flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {kv.imageUrl ? '다시 생성' : '개별 생성'}
                      </button>
                      {sec.visual_description && (
                        <span className="text-[10px] text-[#6b7280] truncate flex-1 text-right" title={sec.visual_description}>
                          {sec.visual_description}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="secondary" onClick={() => setCurrentStep(2)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              스크립트로 돌아가기
            </Button>
            <Button
              onClick={() => setCurrentStep(4)}
              disabled={keyVisuals.length === 0}
            >
              {keyVisualsReady ? (
                <>
                  영상 생성으로
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              ) : (
                <>
                  이미지 없이 영상 생성으로
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════
          STEP 4: 영상 생성
          ════════════════════════════════════════════════════════ */}
      {currentStep === 4 && (
        <Card className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">영상 생성</h2>
            <p className="text-sm text-[#6b7280] mt-1">영상 타입을 선택하고 생성합니다</p>
            {keyVisualsReady && keyVisuals.some((kv) => kv.imageUrl) && (
              <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-xs text-green-700">
                  키 비주얼 {keyVisuals.filter((kv) => kv.imageUrl).length}장이 준비됐습니다.
                  이 이미지를 기반으로 영상이 생성됩니다 (Image-to-Video).
                </p>
              </div>
            )}
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
                      AI 영상 (DALL-E + AI 엔진)
                    </span>
                  </div>
                  <p className="text-xs text-[#6b7280]">
                    섹션별 고품질 AI 영상 클립을 생성합니다
                  </p>
                </label>
              </div>

              {/* Video Engine Selection (slideshow only) */}
              {videoType === 'slideshow' && (
                <div className="space-y-2">
                  <span className="text-sm font-medium text-[#111827]">영상 생성 엔진</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { value: 'kling' as const, label: 'Kling AI', badge: '추천', desc: '자연스러운 동작, 고품질' },
                      { value: 'runway' as const, label: 'Runway Gen-4', badge: null, desc: '빠른 생성, 안정적' },
                      { value: 'sora' as const, label: 'Sora (OpenAI)', badge: null, desc: '최신 모델' },
                    ]).map((engine) => (
                      <label
                        key={engine.value}
                        className={cn(
                          'relative flex flex-col rounded-lg border-2 p-3 cursor-pointer transition-all duration-200',
                          videoEngine === engine.value
                            ? 'border-[#1a5c2e] bg-green-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        <input
                          type="radio"
                          name="video-engine"
                          value={engine.value}
                          checked={videoEngine === engine.value}
                          onChange={() => setVideoEngine(engine.value)}
                          className="sr-only"
                        />
                        <div className="flex items-center gap-2">
                          <svg className={cn('w-4 h-4', videoEngine === engine.value ? 'text-[#1a5c2e]' : 'text-gray-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span className={cn(
                            'text-sm font-semibold',
                            videoEngine === engine.value ? 'text-[#1a5c2e]' : 'text-[#111827]'
                          )}>
                            {engine.label}
                          </span>
                          {engine.badge && (
                            <span className="text-[10px] font-bold bg-[#1a5c2e] text-white px-1.5 py-0.5 rounded-full">
                              {engine.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#6b7280] mt-1 ml-6">{engine.desc}</p>
                      </label>
                    ))}
                  </div>
                </div>
              )}

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
              <div className="space-y-4 pt-2">
                {loading && videoProgressMessage && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                      <p className="text-sm text-blue-700 font-medium">
                        AI가 영상을 생성하고 있습니다...
                      </p>
                    </div>
                    <p className="text-xs text-blue-600 pl-8">
                      {videoProgressMessage}
                    </p>
                    <div className="pl-8">
                      <ProgressBar value={videoProgressPercent} />
                    </div>
                    <p className="text-xs text-[#6b7280] pl-8">
                      페이지를 닫지 마세요. 서버에서 영상을 생성 중입니다. (타임아웃 없음)
                    </p>
                  </div>
                )}
                <div className="text-center">
                  <Button onClick={handleGenerateVideo} disabled={loading} size="lg">
                    {loading ? (
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>영상 생성 중...</span>
                      </div>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {videoType === 'heygen'
                          ? 'AI 아바타 영상 생성 (HeyGen)'
                          : `AI 영상 생성 (${videoEngine === 'runway' ? 'Runway' : videoEngine === 'sora' ? 'Sora' : 'Kling'} + DALL-E)`}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 bg-[#22c55e] rounded-full flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-green-700 font-medium">영상이 성공적으로 생성되었습니다!</p>
              </div>

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
                      // silent — step 4 handles empty accounts gracefully
                    }
                    setCurrentStep(5);
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

      {/* ════════════════════════════════════════════════════════
          STEP 5: 배포 예약
          ════════════════════════════════════════════════════════ */}
      {currentStep === 5 && (
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
                        const pm = PLATFORM_META[account.platform];
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
                  onClick={handlePublish}
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
