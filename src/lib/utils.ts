import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ContentType, ContentStatus } from '@/types';

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
  };
  return labels[type] || type;
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
