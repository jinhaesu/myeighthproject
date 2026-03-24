// ─── Enum-like Union Types ───────────────────────────────────────────────────

export type ContentType = 'health_info' | 'recipe' | 'nutrition_tip' | 'product_ad' | 'brand_ad';
export type ContentStatus = 'draft' | 'script_ready' | 'audio_ready' | 'video_ready' | 'published';
export type Language = 'ko' | 'en';
export type VideoLength = 6 | 15 | 30 | 60;

// ─── Shot Types (광고 샷 유형) ───────────────────────────────────────────────

export type ShotType = 'product_closeup' | 'texture_macro' | 'lifestyle' | 'benefit_frame' | 'endcard';

export interface AdShot {
  shot: number;
  duration: number;
  type: ShotType;
  description: string;
  prompt: string;
}

// ─── Ad Config (광고 제작 설정) ──────────────────────────────────────────────

export interface AdConfig {
  product_name: string;
  category: string;
  benefits: string[];
  target_audience: string;
  tone: string;
  video_length_sec: VideoLength;
  channels: string[];
  package_image_url?: string;
  constraints: string[];
}

// ─── Domain Interfaces ──────────────────────────────────────────────────────

export interface ScriptSection {
  order: number;
  title: string;               // 내부 참조용 (TTS에 안 읽힘)
  body: string;                // 나레이션 대본 (TTS가 읽을 텍스트만, 태그 없이)
  visual_prompt?: string;      // 영상/이미지 생성용 프롬프트 (영어) — deprecated, 통합 visual_scenario 사용 권장
  visual_description: string;  // 시각 연출 설명 (한국어, 사용자 확인용)
  duration_seconds: number;
  shot_type?: ShotType;
}

export interface Content {
  id: number;
  title: string;
  content_type: ContentType;
  status: ContentStatus;
  language: Language;
  script: string | null;
  sections: ScriptSection[] | null;
  audio_path: string | null;
  subtitle_path: string | null;
  video_path: string | null;
  thumbnail_path: string | null;
  scheduled_date: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  video_length: VideoLength | null;
  ad_config: AdConfig | null;
  hooks: string[] | null;
  cta_options: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: number;
  content_id: number | null;
  title: string;
  description: string | null;
  event_date: string;
  event_type: ContentType;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}

export interface GenerationLog {
  id: number;
  content_id: number;
  step: 'script' | 'tts' | 'video' | 'caption' | 'pipeline' | 'image' | 'bgm' | 'ai_video' | 'heygen' | 'kling';
  status: 'started' | 'completed' | 'failed';
  input_params: Record<string, unknown> | null;
  output_result: Record<string, unknown> | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

// ─── Publishing Types ────────────────────────────────────────────────────────

export type Platform = 'instagram' | 'youtube' | 'tiktok' | 'facebook';
export type PublishStatus = 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';

export interface PlatformAccount {
  id: number;
  platform: Platform;
  account_name: string;
  handle: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PublishJob {
  id: number;
  content_id: number;
  platform_account_id: number;
  status: PublishStatus;
  scheduled_at: string;
  published_at: string | null;
  post_url: string | null;
  caption: string | null;
  hashtags: string[] | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  // joined fields
  content_title?: string;
  platform?: Platform;
  account_name?: string;
}

// ─── API Request Types ──────────────────────────────────────────────────────

export interface CreateContentRequest {
  title: string;
  content_type: ContentType;
  language?: Language;
  scheduled_date?: string;
  tags?: string[];
  video_length?: VideoLength;
  ad_config?: AdConfig;
}

export interface UpdateContentRequest {
  title?: string;
  content_type?: ContentType;
  status?: ContentStatus;
  language?: Language;
  script?: string;
  sections?: ScriptSection[];
  scheduled_date?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  video_length?: VideoLength;
  ad_config?: AdConfig;
  hooks?: string[];
  cta_options?: string[];
}

export interface GenerateScriptRequest {
  content_id: number;
  topic?: string;
  keywords?: string[];
  additional_instructions?: string;
  video_length?: VideoLength;
  ad_config?: AdConfig;
}

export interface GenerateTTSRequest {
  content_id: number;
  voice?: string;
  speed?: number;
}

export interface GenerateVideoRequest {
  content_id: number;
  background_color?: string;
  background_image?: string;
  font_size?: number;
  generate_images?: boolean;        // Generate DALL-E images for sections (default true)
  video_engine?: VideoEngine;       // 'kling' | 'runway' | 'sora' (default: kling)
  sections?: Array<{ body: string; visual_prompt?: string; duration_seconds: number }>;
}

export interface CreatePlatformAccountRequest {
  platform: Platform;
  account_name: string;
  handle?: string;
}

export interface CreatePublishJobRequest {
  content_id: number;
  platform_account_id: number;
  scheduled_at: string;
  caption?: string;
  hashtags?: string[];
}

export interface ScheduleBulkPublishRequest {
  content_id: number;
  platforms: Array<{
    platform_account_id: number;
    scheduled_at: string;
    caption?: string;
  }>;
}

export interface CreateCalendarEventRequest {
  content_id?: number;
  title: string;
  description?: string;
  event_date: string;
  event_type: ContentType;
}

// ─── Pipeline Request Types ──────────────────────────────────────────────────

export type VideoType = 'slideshow' | 'heygen';
export type VideoEngine = 'kling' | 'runway' | 'sora';

export interface PipelineRequest {
  content_type: ContentType;
  topic: string;
  language?: Language;
  platforms: number[];           // platform_account_ids
  scheduled_at?: string;
  auto_caption?: boolean;
  premium_mode?: boolean;        // Use ElevenLabs + DALL-E + Mubert
  tts_provider?: 'elevenlabs' | 'edge-tts';
  generate_image?: boolean;      // Auto-generate thumbnail with DALL-E
  generate_bgm?: boolean;        // Auto-generate BGM with Mubert
  video_length?: VideoLength;
  ad_config?: AdConfig;
  video_type?: VideoType;        // 'slideshow' (DALL-E + engine) or 'heygen' (AI avatar)
  video_engine?: VideoEngine;    // 'kling' | 'runway' | 'sora' (default: kling)
  avatar_id?: string;            // HeyGen avatar ID
}

export interface BulkPipelineRequest {
  items: Array<{
    content_type: ContentType;
    topic: string;
  }>;
  language?: Language;
  platforms: number[];
  auto_schedule?: boolean;
  start_date?: string;
  post_time?: string;
}

export interface PlanRequest {
  month: string;                 // "2026-04"
  contents_per_week: number;
  content_types: ContentType[];
  brand_keywords?: string[];
  avoid_topics?: string[];
}

export interface PlanItem {
  date: string;
  content_type: ContentType;
  topic: string;
  description: string;
}

export interface PipelineStepResult {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  duration_ms?: number;
  data?: Record<string, unknown>;
  error?: string;
}

export interface PipelineResult {
  content_id: number;
  steps: PipelineStepResult[];
  publish_job_ids: number[];
  total_duration_ms: number;
}

// ─── PPT Types ──────────────────────────────────────────────────────────────

export type PptPreset = 'business_report' | 'proposal' | 'training' | 'business_plan' | 'custom';

export interface PptSlide {
  layout: 'title_slide' | 'section_header' | 'content' | 'two_column' | 'key_number' | 'table' | 'closing';
  title: string;
  subtitle?: string;
  bullets?: string[];
  left_title?: string;
  left_bullets?: string[];
  right_title?: string;
  right_bullets?: string[];
  numbers?: Array<{ value: string; label: string }>;
  headers?: string[];
  rows?: string[][];
}

export interface PptStructure {
  title: string;
  slides: PptSlide[];
}

export interface GeneratePptRequest {
  text: string;
  preset: PptPreset;
  custom_instruction?: string;
}

// ─── Planning Template Types ─────────────────────────────────────────────────

export interface PlanningTemplate {
  id: number;
  name: string;
  description: string;
  content_type: ContentType;
  video_length: VideoLength;
  language: Language;
  ad_config: AdConfig | null;
  visual_scenario: string;        // unified visual prompt for entire video
  tone_keywords: string[];        // e.g. ["프리미엄", "미니멀", "식욕자극"]
  series_enabled: boolean;
  series_name: string | null;     // e.g. "널담 건강 시리즈"
  series_prefix: string | null;   // e.g. "EP" → "EP1. 제목", "EP2. 제목"
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  content_type: ContentType;
  video_length: VideoLength;
  language?: Language;
  ad_config?: AdConfig;
  visual_scenario?: string;
  tone_keywords?: string[];
  series_enabled?: boolean;
  series_name?: string;
  series_prefix?: string;
}

// ─── API Response Types ─────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
