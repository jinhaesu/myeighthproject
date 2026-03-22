'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { apiGet, apiPost, apiDelete, getFileUrl } from '@/lib/api';
import {
  contentTypeLabel,
  statusLabel,
  statusColor,
  formatDate,
} from '@/lib/utils';
import type { Content } from '@/types';

export default function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiGet<Content>(`/api/contents/${id}`);
        if (res.data) setContent(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load content');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleDelete() {
    setActionLoading('delete');
    try {
      await apiDelete(`/api/contents/${id}`);
      router.push('/contents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setActionLoading(null);
    }
  }

  async function handleRegenerate(step: string, apiPath: string) {
    setActionLoading(step);
    setError(null);
    try {
      await apiPost(apiPath, { content_id: Number(id) });
      // Reload content after regeneration
      const res = await apiGet<Content>(`/api/contents/${id}`);
      if (res.data) setContent(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to regenerate ${step}`);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#22c55e] rounded-full animate-spin" />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="text-center py-16">
        <p className="text-lg font-medium text-[#111827] mb-2">
          콘텐츠를 찾을 수 없습니다
        </p>
        <Button variant="secondary" onClick={() => router.push('/contents')}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push('/contents')}
            className="text-sm text-[#6b7280] hover:text-[#111827] transition-colors mb-3 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            콘텐츠 목록
          </button>
          <h1 className="text-2xl font-bold text-[#111827]">{content.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm text-[#6b7280]">
              {contentTypeLabel(content.content_type)}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusColor(content.status)}`}
            >
              {statusLabel(content.status)}
            </span>
            {content.scheduled_date && (
              <span className="text-sm text-[#6b7280]">
                {formatDate(content.scheduled_date)}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          disabled={actionLoading === 'delete'}
        >
          {actionLoading === 'delete' ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              삭제 중...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              삭제
            </>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Script */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#111827]">스크립트</h2>
          <Button
            variant="secondary"
            size="sm"
            disabled={actionLoading === 'script'}
            onClick={() => handleRegenerate('script', '/api/generate/script')}
          >
            {actionLoading === 'script' ? (
              <>
                <div className="w-3 h-3 border-2 border-[#1a5c2e] border-t-transparent rounded-full animate-spin" />
                재생성 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                스크립트 재생성
              </>
            )}
          </Button>
        </div>
        {content.script ? (
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-[#374151] whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
            {content.script}
          </div>
        ) : (
          <p className="text-sm text-[#6b7280]">스크립트가 아직 생성되지 않았습니다.</p>
        )}
      </Card>

      {/* Audio */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#111827]">음성 (TTS)</h2>
          <Button
            variant="secondary"
            size="sm"
            disabled={actionLoading === 'tts'}
            onClick={() => handleRegenerate('tts', '/api/generate/tts')}
          >
            {actionLoading === 'tts' ? (
              <>
                <div className="w-3 h-3 border-2 border-[#1a5c2e] border-t-transparent rounded-full animate-spin" />
                재생성 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                음성 재생성
              </>
            )}
          </Button>
        </div>
        {content.audio_path ? (
          <audio controls className="w-full" src={getFileUrl(content.audio_path)}>
            브라우저가 오디오를 지원하지 않습니다.
          </audio>
        ) : (
          <p className="text-sm text-[#6b7280]">음성이 아직 생성되지 않았습니다.</p>
        )}
      </Card>

      {/* Thumbnail */}
      {content.thumbnail_path && (
        <Card>
          <h2 className="text-lg font-semibold text-[#111827] mb-4">썸네일</h2>
          <div className="rounded-xl overflow-hidden bg-gray-100">
            <img
              src={getFileUrl(content.thumbnail_path)}
              alt={content.title}
              className="w-full max-h-[400px] object-contain"
            />
          </div>
        </Card>
      )}

      {/* Video */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#111827]">영상</h2>
          <Button
            variant="secondary"
            size="sm"
            disabled={actionLoading === 'video'}
            onClick={() => handleRegenerate('video', '/api/generate/video')}
          >
            {actionLoading === 'video' ? (
              <>
                <div className="w-3 h-3 border-2 border-[#1a5c2e] border-t-transparent rounded-full animate-spin" />
                재생성 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                영상 재생성
              </>
            )}
          </Button>
        </div>
        {content.video_path ? (
          <div className="space-y-3">
            <div className="bg-black rounded-2xl overflow-hidden aspect-video">
              <video
                src={getFileUrl(content.video_path)}
                controls
                className="w-full h-full"
              >
                <track kind="captions" />
                브라우저가 비디오를 지원하지 않습니다.
              </video>
            </div>
            <a
              href={getFileUrl(content.video_path)}
              download
              className="inline-flex items-center gap-2 text-sm font-medium text-[#1a5c2e] hover:text-[#144723] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              영상 다운로드
            </a>
          </div>
        ) : (
          <p className="text-sm text-[#6b7280]">영상이 아직 생성되지 않았습니다.</p>
        )}
      </Card>

      {/* Metadata */}
      {content.tags && content.tags.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-[#111827] mb-4">태그</h2>
          <div className="flex flex-wrap gap-2">
            {content.tags.map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-[#374151]"
              >
                #{tag}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Info */}
      <Card>
        <h2 className="text-lg font-semibold text-[#111827] mb-4">상세 정보</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[#6b7280]">ID</dt>
            <dd className="text-[#111827] font-medium">{content.id}</dd>
          </div>
          <div>
            <dt className="text-[#6b7280]">언어</dt>
            <dd className="text-[#111827] font-medium">
              {content.language === 'ko' ? '한국어' : 'English'}
            </dd>
          </div>
          <div>
            <dt className="text-[#6b7280]">생성일</dt>
            <dd className="text-[#111827] font-medium">
              {formatDate(content.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-[#6b7280]">수정일</dt>
            <dd className="text-[#111827] font-medium">
              {formatDate(content.updated_at)}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
