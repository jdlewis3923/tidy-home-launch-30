/**
 * Tidy — Calm month calendar for the dashboard "Your Schedule" card.
 *
 * Pure presentational: takes a list of visits + selected date, renders a
 * monthly grid with colored service dots and a navy-filled chip for the
 * currently selected day. Click a date → onSelect(iso).
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Tables } from '@/integrations/supabase/types';

type Visit = Tables<'visits'>;

const SERVICE_DOT: Record<string, string> = {
  lawn: 'bg-emerald-500',
  cleaning: 'bg-[hsl(var(--primary))]',
  detailing: 'bg-violet-500',
};

const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function ScheduleCalendar({
  visits,
  selectedDate,
  onSelect,
}: {
  visits: Visit[];
  selectedDate: string;
  onSelect: (iso: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const visitsByDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    visits.forEach((v) => {
      if (!map.has(v.visit_date)) map.set(v.visit_date, new Set());
      map.get(v.visit_date)!.add(v.service);
    });
    return map;
  }, [visits]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const prevMonthDays = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();

    const arr: { iso: string; day: number; inMonth: boolean }[] = [];

    // Leading days from previous month
    for (let i = startWeekday - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - 1, day);
      arr.push({ iso: d.toISOString().slice(0, 10), day, inMonth: false });
    }
    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
      arr.push({ iso: d.toISOString().slice(0, 10), day, inMonth: true });
    }
    // Trailing days to fill 6 rows
    while (arr.length % 7 !== 0 || arr.length < 42) {
      const last = arr[arr.length - 1];
      const d = new Date(last.iso + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      arr.push({
        iso: d.toISOString().slice(0, 10),
        day: d.getDate(),
        inMonth: d.getMonth() === cursor.getMonth(),
      });
      if (arr.length >= 42) break;
    }
    return arr;
  }, [cursor]);

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="mb-3 flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
          className="grid h-7 w-7 place-items-center rounded-full text-ink-faint transition hover:bg-cream hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold tracking-tight text-ink">
          {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
          className="grid h-7 w-7 place-items-center rounded-full text-ink-faint transition hover:bg-cream hover:text-ink"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-2 text-center">
        {WEEK.map((w) => (
          <div key={w} className="text-[10px] font-semibold tracking-[0.12em] text-ink-faint">
            {w}
          </div>
        ))}

        {cells.map((c) => {
          const isSelected = c.iso === selectedDate;
          const isToday = c.iso === todayISO;
          const services = Array.from(visitsByDate.get(c.iso) ?? []);
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => onSelect(c.iso)}
              className={`relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-[13px] transition ${
                isSelected
                  ? 'bg-ink font-semibold text-white shadow-[0_6px_18px_-6px_hsl(var(--ink)/0.45)]'
                  : isToday
                    ? 'font-semibold text-[hsl(var(--primary))]'
                    : c.inMonth
                      ? 'text-ink hover:bg-cream'
                      : 'text-ink-faint/50'
              }`}
            >
              <span className="leading-none">{c.day}</span>
              {services.length > 0 && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {services.slice(0, 3).map((s) => (
                    <span
                      key={s}
                      className={`h-1 w-1 rounded-full ${
                        SERVICE_DOT[s] ?? 'bg-ink-faint'
                      } ${isSelected ? 'opacity-90' : ''}`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-5 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Lawn Care
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" /> House Cleaning
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Car Detailing
        </span>
      </div>
    </div>
  );
}
