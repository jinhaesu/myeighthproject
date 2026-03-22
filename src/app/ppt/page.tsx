'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import TextArea from '@/components/ui/TextArea';
import { cn } from '@/lib/utils';
import type { PptPreset, PptStructure } from '@/types';

const presets: Array<{ value: PptPreset; label: string; description: string; icon: string }> = [
  { value: 'business_report', label: '경영 보고서', description: '핵심 수치 강조, 증감 비교', icon: '📊' },
  { value: 'proposal', label: '거래처 제안서', description: '강점과 기대효과 중심', icon: '🤝' },
  { value: 'training', label: '사내 교육', description: '단계별 쉬운 구성', icon: '📚' },
  { value: 'business_plan', label: '사업 계획서', description: '시장→전략→재무 논리 구조', icon: '🎯' },
  { value: 'custom', label: '직접 지시', description: 'AI에게 자유롭게 지시', icon: '✏️' },
];

const layoutLabels: Record<string, { icon: string; label: string }> = {
  title_slide: { icon: '🎯', label: '표지' },
  section_header: { icon: '📌', label: '섹션' },
  content: { icon: '📝', label: '본문' },
  two_column: { icon: '⚖️', label: '비교' },
  key_number: { icon: '🔢', label: '핵심수치' },
  table: { icon: '📋', label: '표' },
  closing: { icon: '🎬', label: '마무리' },
};

export default function PptPage() {
  const [text, setText] = useState('');
  const [preset, setPreset] = useState<PptPreset>('business_report');
  const [customInstruction, setCustomInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [structure, setStructure] = useState<PptStructure | null>(null);
  const [generated, setGenerated] = useState(false);

  async function handleGenerate() {
    if (!text.trim()) {
      setError('내용을 입력해주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    setStructure(null);
    setGenerated(false);

    try {
      // Step 1: Get structure preview (PUT)
      const previewRes = await fetch('/api/generate/ppt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, preset, custom_instruction: customInstruction }),
      });

      const previewJson = await previewRes.json();
      if (!previewRes.ok || !previewJson.success) {
        throw new Error(previewJson.error || 'AI 구조화 실패');
      }

      setStructure(previewJson.data);

      // Step 2: Generate PPT file (POST)
      const pptRes = await fetch('/api/generate/ppt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, preset, custom_instruction: customInstruction }),
      });

      if (!pptRes.ok) {
        const errJson = await pptRes.json().catch(() => null);
        throw new Error(errJson?.error || 'PPT 생성 실패');
      }

      // Download the file
      const blob = await pptRes.blob();
      const title = decodeURIComponent(pptRes.headers.get('X-PPT-Title') || 'presentation');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PPT 생성 실패');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadAgain() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const pptRes = await fetch('/api/generate/ppt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, preset, custom_instruction: customInstruction }),
      });

      if (!pptRes.ok) throw new Error('PPT 생성 실패');

      const blob = await pptRes.blob();
      const title = decodeURIComponent(pptRes.headers.get('X-PPT-Title') || 'presentation');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PPT 생성 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[#111827]">PPT 자동생성</h2>
        <p className="text-sm text-[#6b7280] mt-1">글을 입력하면 AI가 회사 디자인으로 PPT를 만들어 드립니다</p>
      </div>

      {/* Preset Selection */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => setPreset(p.value)}
            className={cn(
              'p-3 rounded-xl border text-left transition-all duration-200',
              preset === p.value
                ? 'border-[#1a5c2e] bg-green-50 shadow-sm ring-2 ring-[#1a5c2e]/10'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <span className="text-xl">{p.icon}</span>
            <p className={cn(
              'text-sm font-semibold mt-1',
              preset === p.value ? 'text-[#1a5c2e]' : 'text-[#111827]'
            )}>
              {p.label}
            </p>
            <p className="text-[11px] text-[#6b7280] mt-0.5 leading-tight">{p.description}</p>
          </button>
        ))}
      </div>

      {/* Custom Instruction (when preset is custom) */}
      {preset === 'custom' && (
        <Card className="animate-fade-in">
          <TextArea
            id="custom-instruction"
            label="AI에게 지시사항"
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            placeholder="예: 이 글을 투자 유치용 IR 발표 PPT로 구조화하세요. 시장 기회와 성장성을 강조하세요."
            className="min-h-[80px]"
          />
        </Card>
      )}

      {/* Text Input */}
      <Card>
        <TextArea
          id="ppt-text"
          label="PPT로 만들 내용"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="여기에 보고서, 메모, 기획안 등의 내용을 붙여넣으세요...&#10;&#10;예시:&#10;2026년 1분기 매출은 50억원으로 전년 대비 24% 증가했습니다.&#10;온라인 채널 매출이 32억원, 오프라인 채널 매출이 18억원입니다..."
          className="min-h-[240px]"
        />
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-[#6b7280]">
            {text.length > 0 ? `${text.length}자` : ''}
          </p>
          <Button
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
            size="lg"
          >
            {loading ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>PPT 생성 중...</span>
              </div>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                PPT 생성하기
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-fade-in">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Result */}
      {structure && (
        <Card className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[#111827]">{structure.title}</h3>
              <p className="text-sm text-[#6b7280]">슬라이드 {structure.slides.length}장</p>
            </div>
            {generated && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  다운로드 완료
                </div>
                <Button variant="secondary" size="sm" onClick={handleDownloadAgain} disabled={loading}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  다시 다운로드
                </Button>
              </div>
            )}
          </div>

          {/* Slide preview list */}
          <div className="space-y-1.5">
            {structure.slides.map((slide, i) => {
              const meta = layoutLabels[slide.layout] || { icon: '📄', label: slide.layout };
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm w-6 text-right text-[#6b7280] font-mono">{i + 1}</span>
                  <span className="text-base">{meta.icon}</span>
                  <span className="text-xs text-[#6b7280] font-medium w-16">{meta.label}</span>
                  <span className="text-sm text-[#111827] font-medium">{slide.title}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
