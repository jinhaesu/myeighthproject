import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ContentType, ContentStatus, ShotType, VideoLength } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

export function contentTypeLabel(type: ContentType): string {
  const labels: Record<ContentType, string> = {
    health_info: '건강정보',
    recipe: '레시피',
    nutrition_tip: '영양팁',
    product_ad: '제품 광고',
    brand_ad: '브랜드 광고',
  };
  return labels[type] || type;
}

export function contentTypeDescription(type: ContentType): string {
  const descriptions: Record<ContentType, string> = {
    health_info: '건강 관련 정보를 전달하는 교육형 콘텐츠',
    recipe: '요리 레시피를 단계별로 보여주는 콘텐츠',
    nutrition_tip: '영양 관련 실용적인 팁을 공유하는 콘텐츠',
    product_ad: '제품 중심의 퍼포먼스 광고 (패키지, 질감, 효익 중심)',
    brand_ad: '브랜드 인지도를 높이는 라이프스타일형 광고',
  };
  return descriptions[type] || '';
}

export function videoLengthLabel(length: VideoLength): string {
  const labels: Record<VideoLength, string> = {
    6: '6초 범퍼',
    15: '15초 숏폼',
    30: '30초 광고',
    60: '60초 콘텐츠',
  };
  return labels[length] || `${length}초`;
}

export function videoLengthDescription(length: VideoLength): string {
  const descriptions: Record<VideoLength, string> = {
    6: '임팩트 있는 한 문장 + 제품샷 (YouTube 범퍼, 스토리)',
    15: '훅 → 제품 → 효익 → CTA (Instagram Reels, TikTok 최적)',
    30: '스토리텔링 + 제품 소개 + CTA (Facebook, YouTube Pre-roll)',
    60: '깊이 있는 정보 전달 + 브랜드 스토리 (YouTube Shorts, 교육형)',
  };
  return descriptions[length] || '';
}

export function shotTypeLabel(type: ShotType): string {
  const labels: Record<ShotType, string> = {
    product_closeup: '제품 클로즈업',
    texture_macro: '질감/단면 매크로',
    lifestyle: '라이프스타일',
    benefit_frame: '효익 설명',
    endcard: '엔드카드',
  };
  return labels[type] || type;
}

export function shotTypeDescription(type: ShotType): string {
  const descriptions: Record<ShotType, string> = {
    product_closeup: '패키지/제품 탁상 샷 — 브랜드 인지',
    texture_macro: '빵을 찢거나 음식 질감을 보여주는 샷 — 맛/식감 전달',
    lifestyle: '아침 커피와 함께, 운동 후 등 — 사용 상황 전달',
    benefit_frame: '고단백/저당 등 텍스트 오버레이 — 기능성 전달',
    endcard: '제품 + 로고 + CTA — 구매 유도',
  };
  return descriptions[type] || '';
}

export function statusLabel(status: ContentStatus): string {
  const labels: Record<ContentStatus, string> = {
    draft: '초안',
    script_ready: '스크립트 완료',
    audio_ready: '음성 완료',
    video_ready: '영상 완료',
    published: '게시됨',
  };
  return labels[status] || status;
}

export function statusColor(status: ContentStatus): string {
  const colors: Record<ContentStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    script_ready: 'bg-blue-100 text-blue-700',
    audio_ready: 'bg-purple-100 text-purple-700',
    video_ready: 'bg-orange-100 text-orange-700',
    published: 'bg-green-100 text-green-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

export function statusDotColor(status: ContentStatus): string {
  const colors: Record<ContentStatus, string> = {
    draft: 'bg-gray-400',
    script_ready: 'bg-blue-500',
    audio_ready: 'bg-purple-500',
    video_ready: 'bg-orange-500',
    published: 'bg-green-500',
  };
  return colors[status] || 'bg-gray-400';
}
