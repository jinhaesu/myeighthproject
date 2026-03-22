'use client';

import { useEffect, useState, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { apiGet } from '@/lib/api';
import {
  contentTypeLabel,
  statusLabel,
  statusColor,
  statusDotColor,
  cn,
} from '@/lib/utils';
import type { CalendarEvent, ContentStatus } from '@/types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<CalendarEvent[]>(
        `/api/calendar?year=${year}&month=${month + 1}`
      );
      setEvents(res.data || []);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function prevMonth() {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  // Build calendar grid
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const day = i - firstDay + 1;
    cells.push(day >= 1 && day <= daysInMonth ? day : null);
  }

  // Group events by date string (YYYY-MM-DD)
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  events.forEach((ev) => {
    const dateKey = ev.event_date.slice(0, 10);
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    eventsByDate[dateKey].push(ev);
  });

  function dateKey(day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function handleDateClick(day: number) {
    const key = dateKey(day);
    setSelectedDate(key);
    setModalOpen(true);
  }

  const selectedEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];

  const today = new Date();
  const isToday = (day: number) =>
    year === today.getFullYear() &&
    month === today.getMonth() &&
    day === today.getDate();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-[#111827]">
            {year}년 {month + 1}월
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#6b7280] hover:bg-gray-100 hover:text-[#111827] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#6b7280] hover:bg-gray-100 hover:text-[#111827] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setYear(now.getFullYear());
            setMonth(now.getMonth());
          }}
        >
          오늘
        </Button>
      </div>

      {/* Calendar Grid */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#22c55e] rounded-full animate-spin" />
          </div>
        ) : (
          <div>
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {WEEKDAYS.map((wd, i) => (
                <div
                  key={wd}
                  className={cn(
                    'py-3 text-center text-xs font-semibold uppercase tracking-wider',
                    i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-[#6b7280]'
                  )}
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                const dayIdx = idx % 7;
                const key = day ? dateKey(day) : `empty-${idx}`;
                const dayEvents = day ? eventsByDate[dateKey(day)] || [] : [];

                return (
                  <div
                    key={key}
                    onClick={() => day && handleDateClick(day)}
                    className={cn(
                      'min-h-[110px] border-b border-r border-gray-50 p-2 transition-colors',
                      day ? 'hover:bg-green-50/30 cursor-pointer' : 'bg-gray-50/30',
                      dayIdx === 6 && 'border-r-0'
                    )}
                  >
                    {day && (
                      <>
                        <span
                          className={cn(
                            'inline-flex items-center justify-center w-7 h-7 text-sm rounded-full transition-colors',
                            isToday(day)
                              ? 'bg-[#22c55e] text-white font-bold'
                              : dayIdx === 0
                                ? 'text-red-400'
                                : dayIdx === 6
                                  ? 'text-blue-400'
                                  : 'text-[#111827]'
                          )}
                        >
                          {day}
                        </span>
                        {dayEvents.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {dayEvents.slice(0, 3).map((ev) => (
                              <div
                                key={ev.id}
                                className="flex items-center gap-1.5"
                              >
                                <span
                                  className={cn(
                                    'w-1.5 h-1.5 rounded-full shrink-0',
                                    statusDotColor(ev.status as ContentStatus)
                                  )}
                                />
                                <span className="text-[11px] text-[#6b7280] truncate leading-tight">
                                  {ev.title}
                                </span>
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <span className="text-[10px] text-gray-400 pl-3">
                                +{dayEvents.length - 3}개 더
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Date detail modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={selectedDate ? `${selectedDate} 콘텐츠` : ''}
      >
        {selectedEvents.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-[#6b7280] text-sm">
              해당 날짜에 예정된 콘텐츠가 없습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-[#111827]">{ev.title}</p>
                  <p className="text-xs text-[#6b7280] mt-0.5">
                    {contentTypeLabel(ev.event_type)}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusColor(ev.status as ContentStatus)}`}
                >
                  {statusLabel(ev.status as ContentStatus)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
