/**
 * Tidy — Customer command center.
 *
 * "everything is already handled" — calm, state-aware home for logged-in
 * customers. Pulls live data via useDashboardData (profiles, subscriptions,
 * visits, invoices) and lays out:
 *   • welcome strip with light hero wash
 *   • 4 summary cards: next visit, last service, next billing, plan
 *   • main grid: schedule calendar (left) + upcoming/referral/notification (right)
 *   • recent service photo card with crew + actions
 *   • quick action row (modals, never page redirects)
 *
 * If the user lands here without an account → bounce to /login.
 * If they're authed but have no subscription → calm empty state CTA.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  Star,
  ChevronRight,
  Clock,
  Sparkles,
  MessageSquare,
  Lock,
  HelpCircle,
  StickyNote,
  Camera,
  ArrowRight,
} from 'lucide-react';
import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import ScheduleCalendar from '@/components/dashboard/ScheduleCalendar';
import CalmModal from '@/components/dashboard/CalmModal';
import {
  useDashboardData,
  relativeDateLabel,
  formatLongDate,
  formatMoney,
  serviceLabel,
} from '@/lib/dashboard-data';
import lawnImg from '@/assets/lawn-care.jpg';
import cleaningImg from '@/assets/cleaning-interior.jpg';
import detailImg from '@/assets/car-detailing.jpg';
import heroWash from '@/assets/hero-miami-home.jpg';

const SERVICE_ICON: Record<string, string> = {
  lawn: '🌿',
  cleaning: '🏠',
  detailing: '🚗',
};

const SERVICE_PHOTO: Record<string, string> = {
  lawn: lawnImg,
  cleaning: cleaningImg,
  detailing: detailImg,
};

const SERVICE_DOT_BG: Record<string, string> = {
  lawn: 'bg-emerald-500',
  cleaning: 'bg-[hsl(var(--primary))]',
  detailing: 'bg-violet-500',
};

const TIME_WINDOW_FALLBACK = '8:00 – 11:00 AM';

export default function DashboardIndex() {
  const navigate = useNavigate();
  const data = useDashboardData();
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [scheduleView, setScheduleView] = useState<'calendar' | 'list'>('calendar');
  const [activeModal, setActiveModal] = useState<null |
    'reschedule' | 'note' | 'access' | 'plan' | 'payment' | 'help' | 'visit'>(null);

  // Bounce unauthenticated visitors to login (after the auth state resolves).
  useEffect(() => {
    if (!data.loading && !data.isAuthed) {
      navigate('/login', { replace: true });
    }
  }, [data.loading, data.isAuthed, navigate]);

  // Surface a clicked visit's date when a calendar day or list row is selected.
  const visitsOnSelected = useMemo(
    () => data.visits.filter((v) => v.visit_date === selectedDate),
    [data.visits, selectedDate]
  );

  if (data.loading) {
    return (
      <div className="min-h-screen bg-cream">
        <DashboardTopNav />
        <div className="mx-auto max-w-[1280px] px-6 py-12">
          <div className="h-8 w-64 animate-pulse rounded bg-white/70" />
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/70" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data.isAuthed) return null;

  // Empty-plan state — gentle nudge, doesn't shout.
  const noPlan = !data.subscription || data.subscription.services.length === 0;

  return (
    <div className="min-h-screen bg-cream text-ink">
      <DashboardTopNav initials={data.initials} />

      {/* Welcome strip with very low-opacity hero wash */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `url(${heroWash})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center right',
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cream via-cream/80 to-transparent" />

        <div className="relative mx-auto flex max-w-[1280px] flex-col gap-6 px-6 pb-6 pt-10 md:flex-row md:items-start md:justify-between">
          <div className="animate-calm-in">
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              welcome back,{' '}
              <span className="text-[hsl(var(--primary))]">
                {data.firstName.toLowerCase()}.
              </span>
            </h1>
            <p className="mt-3 text-base text-ink-soft md:text-lg">
              your home, yard &amp; car are handled.{' '}
              <span className="ml-2 italic text-ink-faint">we'll take it from here.</span>
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--hairline))] bg-white px-4 py-3 shadow-[0_4px_20px_rgba(15,23,42,0.04)] md:max-w-xs">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[hsl(var(--primary))]">
                You're all set.
              </div>
              <div className="text-xs text-ink-soft">We'll take it from here.</div>
            </div>
          </div>
        </div>
      </section>

      {noPlan ? (
        <section className="relative mx-auto max-w-[1280px] px-6 pb-20">
          <div className="rounded-3xl border border-[hsl(var(--hairline))] bg-white p-12 text-center shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
            <h2 className="text-2xl font-bold text-ink">nothing scheduled yet.</h2>
            <p className="mt-2 text-ink-soft">
              Set up your home and we'll start handling the rest.
            </p>
            <Link
              to="/dashboard/plan"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_-10px_hsl(var(--ink)/0.55)] transition hover:bg-ink-soft"
            >
              set up your home <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Summary cards */}
          <section className="relative mx-auto max-w-[1280px] px-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                icon={<Calendar className="h-4 w-4 text-[hsl(var(--primary))]" />}
                label="Next Visit"
                title={data.nextVisit ? relativeDateLabel(data.nextVisit.visit_date) : 'None scheduled'}
                onClick={() => data.nextVisit && setActiveModal('visit')}
              >
                {data.nextVisit ? (
                  <>
                    <div className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
                      <span>{formatLongDate(data.nextVisit.visit_date)}</span>
                      <span>·</span>
                      <span>{data.nextVisit.time_window || TIME_WINDOW_FALLBACK}</span>
                      <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Scheduled
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                        <span>{SERVICE_ICON[data.nextVisit.service]}</span>
                        {serviceLabel(data.nextVisit.service)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-ink-faint" />
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-ink-soft">We'll add a visit soon.</p>
                )}
              </SummaryCard>

              <SummaryCard
                icon={<CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))]" />}
                label="Last Service"
                title={data.lastCompleted ? formatLongDate(data.lastCompleted.visit_date) : 'No history yet'}
              >
                {data.lastCompleted && (
                  <>
                    <div className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
                      <span>{SERVICE_ICON[data.lastCompleted.service]}</span>
                      <span>{serviceLabel(data.lastCompleted.service)}</span>
                    </div>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border border-[hsl(var(--hairline))] py-2 text-sm font-medium text-[hsl(var(--primary))] transition hover:bg-cream"
                    >
                      View details
                    </button>
                  </>
                )}
              </SummaryCard>

              <SummaryCard
                icon={<CreditCard className="h-4 w-4 text-[hsl(var(--primary))]" />}
                label="Next Billing"
                title={
                  data.subscription?.next_billing_date
                    ? formatLongDate(data.subscription.next_billing_date)
                    : '—'
                }
              >
                <div className="mt-1 text-sm text-ink-soft">
                  {formatMoney(data.subscription?.monthly_total_cents)}
                </div>
                <Link
                  to="/billing"
                  className="mt-3 block w-full rounded-lg border border-[hsl(var(--hairline))] py-2 text-center text-sm font-medium text-[hsl(var(--primary))] transition hover:bg-cream"
                >
                  View billing
                </Link>
              </SummaryCard>

              <SummaryCard
                icon={<Star className="h-4 w-4 text-[hsl(var(--primary))]" />}
                label="Plan"
                title={`${data.subscription!.services.length} ${
                  data.subscription!.services.length === 1 ? 'Service' : 'Services'
                }`}
              >
                <div className="mt-1 text-sm capitalize text-ink-soft">
                  {data.subscription!.frequency}
                </div>
                <Link
                  to="/dashboard/plan"
                  className="mt-3 block w-full rounded-lg border border-[hsl(var(--hairline))] py-2 text-center text-sm font-medium text-[hsl(var(--primary))] transition hover:bg-cream"
                >
                  Manage plan
                </Link>
              </SummaryCard>
            </div>
          </section>

          {/* Main grid */}
          <section className="relative mx-auto mt-6 max-w-[1280px] px-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Schedule (spans 2) */}
              <div className="lg:col-span-2">
                <Card>
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                      <Calendar className="h-4 w-4 text-[hsl(var(--primary))]" />
                      Your Schedule
                    </h2>
                    <div className="flex rounded-full bg-cream p-1 text-xs font-medium">
                      {(['calendar', 'list'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setScheduleView(v)}
                          className={`rounded-full px-3 py-1 transition ${
                            scheduleView === v
                              ? 'bg-white text-[hsl(var(--primary))] shadow-sm'
                              : 'text-ink-faint hover:text-ink'
                          }`}
                        >
                          {v === 'calendar' ? 'Calendar' : 'List'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5">
                    {scheduleView === 'calendar' ? (
                      <ScheduleCalendar
                        visits={data.visits}
                        selectedDate={selectedDate}
                        onSelect={(iso) => setSelectedDate(iso)}
                      />
                    ) : (
                      <ScheduleList
                        visits={data.upcoming}
                        onSelect={(iso) => {
                          setSelectedDate(iso);
                          setScheduleView('calendar');
                        }}
                      />
                    )}
                  </div>

                  {visitsOnSelected.length > 0 && (
                    <div className="mt-5 rounded-xl border border-[hsl(var(--hairline))] bg-cream/40 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                        {formatLongDate(selectedDate)}
                      </div>
                      <ul className="mt-2 space-y-2">
                        {visitsOnSelected.map((v) => (
                          <li key={v.id} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-ink">
                              <span className={`h-2 w-2 rounded-full ${SERVICE_DOT_BG[v.service]}`} />
                              {serviceLabel(v.service)}
                            </span>
                            <span className="text-ink-faint">
                              {v.time_window || TIME_WINDOW_FALLBACK}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              </div>

              {/* Upcoming list */}
              <div className="space-y-4">
                <Card>
                  <h2 className="text-base font-bold text-ink">Upcoming Visits</h2>
                  <ul className="mt-4 divide-y divide-[hsl(var(--hairline))]/70">
                    {data.upcoming.slice(0, 4).map((v) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(v.visit_date);
                            setActiveModal('visit');
                          }}
                          className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-cream/50"
                        >
                          <span className="grid h-9 w-9 place-items-center rounded-lg bg-cream text-base">
                            {SERVICE_ICON[v.service]}
                          </span>
                          <span className="flex-1">
                            <span className="block text-sm font-semibold text-ink">
                              {relativeDateLabel(v.visit_date)}
                            </span>
                            <span className="block text-xs text-ink-soft">
                              {serviceLabel(v.service)} · {formatLongDate(v.visit_date)},{' '}
                              {v.time_window || TIME_WINDOW_FALLBACK}
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 text-ink-faint" />
                        </button>
                      </li>
                    ))}
                    {data.upcoming.length === 0 && (
                      <li className="py-3 text-sm text-ink-faint">
                        No upcoming visits scheduled.
                      </li>
                    )}
                  </ul>
                  <Link
                    to="/dashboard/plan"
                    className="mt-3 block text-center text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
                  >
                    View full schedule
                  </Link>
                </Card>

                <ReferralCard />

                <Card className="bg-cream/60">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                    <MessageSquare className="h-4 w-4 text-[hsl(var(--primary))]" />
                    Stay in the know
                  </h3>
                  <div className="mt-3 flex gap-3 rounded-xl bg-white p-3 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="text-sm text-ink-soft">
                      <span className="font-semibold text-ink">We're coming up!</span>{' '}
                      {data.nextVisit ? (
                        <>
                          {serviceLabel(data.nextVisit.service)}{' '}
                          {relativeDateLabel(data.nextVisit.visit_date).toLowerCase()} between{' '}
                          {data.nextVisit.time_window || TIME_WINDOW_FALLBACK}.
                        </>
                      ) : (
                        <>We'll send you a heads-up before every visit.</>
                      )}
                      <span className="mt-1 block text-ink-faint">
                        We'll see you then.
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </section>

          {/* Recent service photo */}
          <section className="relative mx-auto mt-4 max-w-[1280px] px-6">
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-ink">Recent Service</h2>
                {data.lastCompleted && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Completed
                  </span>
                )}
              </div>

              {data.lastCompleted ? (
                <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-[260px_1fr]">
                  <div className="relative h-44 overflow-hidden rounded-xl bg-cream">
                    <img
                      src={SERVICE_PHOTO[data.lastCompleted.service]}
                      alt={`${serviceLabel(data.lastCompleted.service)} proof`}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-ink/85 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <Camera className="h-3 w-3" /> Photo proof
                    </div>
                  </div>
                  <div className="flex flex-col justify-between">
                    <div>
                      <div className="text-sm text-ink-faint">
                        {formatLongDate(data.lastCompleted.visit_date)}
                      </div>
                      <div className="mt-1 text-lg font-bold text-ink">
                        {serviceLabel(data.lastCompleted.service)}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-sm text-ink-soft">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {data.lastCompleted.time_window || TIME_WINDOW_FALLBACK}
                        </span>
                        <span>·</span>
                        <span>Pro: Daniel &amp; Team</span>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-[hsl(var(--hairline))] px-4 py-2 text-sm font-medium text-ink transition hover:bg-cream"
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-4 py-2 text-sm font-medium text-[hsl(var(--primary))] hover:underline"
                      >
                        Leave a review
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink-soft">
                  After your first visit, photo proof will appear here.
                </p>
              )}
            </Card>
          </section>

          {/* Quick actions */}
          <section className="relative mx-auto mt-4 max-w-[1280px] px-6 pb-16">
            <Card>
              <h3 className="text-sm font-bold text-ink">Quick Actions</h3>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                <QuickAction icon={<Calendar className="h-4 w-4" />} label="Reschedule" onClick={() => setActiveModal('reschedule')} />
                <QuickAction icon={<StickyNote className="h-4 w-4" />} label="Add a Note" onClick={() => setActiveModal('note')} />
                <QuickAction icon={<Lock className="h-4 w-4" />} label="Update Access" onClick={() => setActiveModal('access')} />
                <QuickAction icon={<Sparkles className="h-4 w-4" />} label="Manage Plan" onClick={() => setActiveModal('plan')} />
                <QuickAction icon={<CreditCard className="h-4 w-4" />} label="Payment Method" onClick={() => setActiveModal('payment')} />
                <QuickAction icon={<HelpCircle className="h-4 w-4" />} label="Help Center" onClick={() => setActiveModal('help')} />
              </div>
            </Card>
          </section>
        </>
      )}

      {/* Quick action modals — shared shell, copy varies */}
      <CalmModal
        open={activeModal === 'visit'}
        title={
          data.nextVisit
            ? `${serviceLabel(data.nextVisit.service)} · ${relativeDateLabel(data.nextVisit.visit_date)}`
            : 'Visit details'
        }
        subtitle={
          data.nextVisit
            ? `${formatLongDate(data.nextVisit.visit_date)} · ${data.nextVisit.time_window || TIME_WINDOW_FALLBACK}`
            : undefined
        }
        onClose={() => setActiveModal(null)}
        primaryLabel="Got it"
      >
        <div className="space-y-3 text-sm text-ink-soft">
          <p>
            <span className="font-semibold text-ink">Status:</span>{' '}
            <span className="capitalize">{data.nextVisit?.status ?? 'scheduled'}</span>
          </p>
          {data.nextVisit?.notes && <p>{data.nextVisit.notes}</p>}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setActiveModal('reschedule')}
              className="flex-1 rounded-lg border border-[hsl(var(--hairline))] py-2 text-sm font-medium text-ink hover:bg-cream"
            >
              Reschedule
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('note')}
              className="flex-1 rounded-lg border border-[hsl(var(--hairline))] py-2 text-sm font-medium text-ink hover:bg-cream"
            >
              Add note
            </button>
          </div>
        </div>
      </CalmModal>

      <CalmModal
        open={activeModal === 'reschedule'}
        title="Reschedule visit"
        subtitle="Pick a new date and time window."
        onClose={() => setActiveModal(null)}
        primaryLabel="Update visit"
      >
        <div className="space-y-3">
          <input
            type="date"
            defaultValue={data.nextVisit?.visit_date ?? ''}
            className="w-full rounded-lg border border-[hsl(var(--hairline))] bg-white px-3 py-2 text-sm text-ink"
          />
          <select className="w-full rounded-lg border border-[hsl(var(--hairline))] bg-white px-3 py-2 text-sm text-ink">
            <option>8:00 AM – 12:00 PM</option>
            <option>12:00 PM – 5:00 PM</option>
          </select>
        </div>
      </CalmModal>

      <CalmModal
        open={activeModal === 'note'}
        title="Add a note"
        subtitle="Anything our crew should know before they arrive?"
        onClose={() => setActiveModal(null)}
        primaryLabel="Save note"
      >
        <textarea
          rows={4}
          placeholder="e.g. Gate code is 4827, dog will be inside."
          className="w-full resize-none rounded-lg border border-[hsl(var(--hairline))] bg-white px-3 py-2 text-sm text-ink"
        />
      </CalmModal>

      <CalmModal
        open={activeModal === 'access'}
        title="Update access"
        subtitle="Gate codes, parking notes, pet info — keep us in the loop."
        onClose={() => setActiveModal(null)}
        primaryLabel="Save changes"
      >
        <div className="space-y-3 text-sm">
          <Field label="Gate code" defaultValue={data.profile?.gate_code ?? ''} />
          <Field label="Parking notes" defaultValue={data.profile?.parking_notes ?? ''} />
          <Field label="Pets" defaultValue={data.profile?.pets ?? ''} />
        </div>
      </CalmModal>

      <CalmModal
        open={activeModal === 'plan'}
        title="Manage your plan"
        subtitle="Add or remove services, change frequency, pause anytime."
        onClose={() => setActiveModal(null)}
        primaryLabel="Open plan builder"
        onPrimary={() => navigate('/dashboard/plan')}
      />

      <CalmModal
        open={activeModal === 'payment'}
        title="Payment method"
        subtitle="Manage your card on file."
        onClose={() => setActiveModal(null)}
        primaryLabel="Open billing"
        onPrimary={() => navigate('/billing')}
      />

      <CalmModal
        open={activeModal === 'help'}
        title="Help Center"
        subtitle="We're here. Text, email, or browse common questions."
        onClose={() => setActiveModal(null)}
        primaryLabel="Text us"
      >
        <ul className="space-y-2 text-sm text-ink-soft">
          <li>📱 Text: (305) 555‑0142</li>
          <li>📧 Email: hello@jointidy.co</li>
          <li>🕘 Mon–Sat, 8am–6pm</li>
        </ul>
      </CalmModal>
    </div>
  );
}

/* ---------- small helpers ---------- */

function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[hsl(var(--hairline))]/70 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  title,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left rounded-2xl border border-[hsl(var(--hairline))]/70 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition ${
        onClick ? 'hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(15,23,42,0.07)]' : ''
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-ink-soft">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-ink">{title}</div>
      {children}
    </button>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border border-transparent px-3 py-4 text-center text-sm font-medium text-ink transition hover:border-[hsl(var(--hairline))] hover:bg-cream/50"
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-cream text-ink-soft">
        {icon}
      </span>
      {label}
    </button>
  );
}

function Field({
  label,
  defaultValue,
}: {
  label: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-faint">{label}</span>
      <input
        type="text"
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-[hsl(var(--hairline))] bg-white px-3 py-2 text-ink"
      />
    </label>
  );
}

function ScheduleList({
  visits,
  onSelect,
}: {
  visits: ReturnType<typeof useDashboardData>['upcoming'];
  onSelect: (iso: string) => void;
}) {
  if (visits.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-faint">
        No upcoming visits — we'll keep you posted.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[hsl(var(--hairline))]/70">
      {visits.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            onClick={() => onSelect(v.visit_date)}
            className="flex w-full items-center justify-between py-3 text-left hover:bg-cream/40"
          >
            <span className="flex items-center gap-3">
              <span className={`h-2 w-2 rounded-full ${SERVICE_DOT_BG[v.service]}`} />
              <span>
                <span className="block text-sm font-semibold text-ink">
                  {serviceLabel(v.service)}
                </span>
                <span className="block text-xs text-ink-soft">
                  {relativeDateLabel(v.visit_date)} · {v.time_window || TIME_WINDOW_FALLBACK}
                </span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-ink-faint" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReferralCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--hairline))]/70 bg-gradient-to-br from-[hsl(var(--primary))]/8 via-white to-cream p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="relative">
        <div className="text-xs font-medium text-ink-soft">Love Tidy?</div>
        <h3 className="mt-1 text-lg font-bold tracking-tight text-ink">Share &amp; Save</h3>
        <p className="mt-1 max-w-[14rem] text-sm text-ink-soft">
          Refer a friend and you both get{' '}
          <span className="font-semibold text-[hsl(var(--primary))]">$50 off</span>{' '}
          your next month.
        </p>
        <Link
          to="/refer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_-8px_hsl(var(--primary)/0.6)] transition hover:bg-[hsl(var(--primary-deep))]"
        >
          Invite Friends <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {/* Minimal gift glyph corner */}
      <div className="absolute -bottom-3 -right-2 text-7xl opacity-90 select-none" aria-hidden>
        🎁
      </div>
    </div>
  );
}
