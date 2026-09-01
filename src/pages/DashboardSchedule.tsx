/**
 * Tidy — /dashboard/schedule
 *
 * The real "full schedule" view: the month calendar plus a chronological list
 * of every upcoming visit and a history of past ones. This is where the
 * dashboard's "View full schedule" link lands (it used to bounce customers
 * into the plan builder).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Clock, History } from 'lucide-react';
import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import ScheduleCalendar from '@/components/dashboard/ScheduleCalendar';
import CarSlotPicker from '@/components/dashboard/CarSlotPicker';
import RouteFallback from '@/components/RouteFallback';
import type { CarServiceCode } from '@/lib/pricing-canon';
import {
  useDashboardData,
  formatLongDate,
  relativeDateLabel,
  serviceLabel,
} from '@/lib/dashboard-data';
import { useLanguage } from '@/contexts/LanguageContext';

const SERVICE_DOT: Record<string, string> = {
  lawn: 'bg-emerald-500',
  cleaning: 'bg-[hsl(var(--primary))]',
  detailing: 'bg-violet-500',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  on_the_way: 'On the way',
  in_progress: 'In progress',
  complete: 'Complete',
  canceled: 'Canceled',
  skipped: 'Skipped',
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-[hsl(var(--hairline))] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export default function DashboardSchedule() {
  const data = useDashboardData();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [showAllPast, setShowAllPast] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [carSlot, setCarSlot] = useState<number | null>(null);

  useEffect(() => {
    if (!data.loading && !data.isAuthed) navigate('/login', { replace: true });
  }, [data.loading, data.isAuthed, navigate]);

  const past = useMemo(
    () =>
      data.visits
        .filter((v) => !data.upcoming.some((u) => u.id === v.id))
        .slice()
        .reverse(),
    [data.visits, data.upcoming],
  );

  if (data.loading) return <RouteFallback />;

  const visiblePast = showAllPast ? past : past.slice(0, 6);
  const carServiceCode = (data.subscription?.car_service_code ?? null) as CarServiceCode | null;

  return (
    <div className="min-h-screen bg-cream">
      <DashboardTopNav initials={data.initials} />

      <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
            {t('Your schedule')}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t('Every visit we have on the books, plus what we have already handled.')}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <ScheduleCalendar visits={data.visits} selectedDate={selectedDate} onSelect={setSelectedDate} />
          </Card>

          <div className="space-y-6">
            {carServiceCode && (
              <CarSlotPicker carServiceCode={carServiceCode} value={carSlot} onChange={setCarSlot} />
            )}
            <Card>
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                <CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" />
                {t('Upcoming visits')}
              </h2>
              {data.upcoming.length === 0 ? (
                <div className="mt-4 rounded-xl bg-cream/50 p-4 text-sm text-ink-soft">
                  {t('Nothing scheduled yet.')}{' '}
                  <Link to="/dashboard/plan" className="font-semibold text-[hsl(var(--primary))]">
                    {t('set up your home')}
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {data.upcoming.map((v) => (
                    <li key={v.id} className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SERVICE_DOT[v.service] ?? 'bg-ink-faint'}`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{serviceLabel(v.service)}</p>
                        <p className="text-xs text-ink-soft">
                          {formatLongDate(v.visit_date)}
                          {v.time_window ? ` · ${v.time_window}` : ''}
                        </p>
                        <p className="text-[11px] text-ink-faint">
                          {relativeDateLabel(v.visit_date)} · {t(STATUS_LABEL[v.status] ?? v.status)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/dashboard/services"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--primary))]"
              >
                <Clock className="h-4 w-4" />
                {t('Add to your next visit')}
              </Link>
            </Card>

            <Card>
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                <History className="h-4 w-4 text-[hsl(var(--primary))]" />
                {t('Past visits')}
              </h2>
              {past.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">{t('No visits yet.')}</p>
              ) : (
                <>
                  <ul className="mt-4 space-y-3">
                    {visiblePast.map((v) => (
                      <li key={v.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">{serviceLabel(v.service)}</p>
                          <p className="text-xs text-ink-soft">{formatLongDate(v.visit_date)}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                          {t(STATUS_LABEL[v.status] ?? v.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {past.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setShowAllPast((v) => !v)}
                      className="mt-4 text-sm font-semibold text-[hsl(var(--primary))]"
                    >
                      {showAllPast ? t('Show less') : t('Show all')}
                    </button>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
