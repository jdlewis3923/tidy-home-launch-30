/**
 * Schedule (home) — /pro/schedule
 * Metric tiles, this week / next week, visits grouped by day.
 * COI blocking banner sits at the top: upcoming visits stay visible, starting
 * one does not (enforced server-side in pro-visit-action).
 */
import { useEffect, useMemo, useState } from "react";
import ProLaunchLine from "@/components/pro/ProLaunchLine";
import { Navigate } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import InstallPrompt from "@/components/pro/portal/InstallPrompt";
import PushOptIn from "@/components/pro/portal/PushOptIn";
import ProPartnerStrip from "@/components/pro/ProPartnerStrip";
import {
  EmptyState, ErrorState, Eyebrow, HeroPanel, ScheduleSkeleton, VisitRow, WarningBanner, ProButton,
} from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { dayLabel, fetchNotifications, mondayOf, timeWindow } from "@/lib/pro-portal";
import { money } from "@/lib/pro-pay";
import WeeklyRoute from "@/components/pro/schedule/WeeklyRoute";
import MyDates from "@/components/pro/schedule/MyDates";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const COI_LABEL: Record<string, string> = {
  none: "Insurance",
  under_review: "Under review",
  active: "Active",
  expiring: "Expiring",
  expired: "Expired",
};

const PUSH_CARD_KEY = "tidy_pro_push_card_dismissed";

export default function ProSchedule() {
  const { me, coi, visits, loading, error, reload, userId } = useProSession();
  const { language } = useLanguage();
  const es = language === 'es';
  const [routeRange,setRouteRange] = useState<'today'|'week'>('today');
  const [week, setWeek] = useState<"this" | "next">("this");
  const [tab, setTab] = useState<"route" | "dates">("dates");
  const [unread, setUnread] = useState(0);
  const [showPushCard, setShowPushCard] = useState(
    () => typeof window !== "undefined" && !localStorage.getItem(PUSH_CARD_KEY),
  );


  useEffect(() => {
    if (!userId) return;
    void fetchNotifications()
      .then((n) => setUnread(n.filter((x) => !x.read_at).length))
      .catch(() => setUnread(0));
  }, [userId]);

  const bounds = useMemo(() => {
    const start = mondayOf(new Date());
    if (week === "next") start.setDate(start.getDate() + 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }, [week]);

  const inWeek = useMemo(
    () =>
      visits.filter((v) => {
        if (!v.scheduled_start) return false;
        const d = new Date(v.scheduled_start);
        return d >= bounds.start && d < bounds.end;
      }),
    [visits, bounds],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof inWeek>();
    for (const v of inWeek) {
      const key = dayLabel(v.scheduled_start);
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return [...map.entries()];
  }, [inWeek]);

  const thisWeekStart = mondayOf(new Date());
  const completedThisWeek = visits.filter(
    (v) => v.completed_at && new Date(v.completed_at) >= thisWeekStart,
  );
  const earnedCents = completedThisWeek.reduce((s, v) => s + (v.visit_pay_cents ?? 0), 0);
  const nextPayoutFriday = useMemo(() => {
    const d = new Date(thisWeekStart);
    d.setDate(d.getDate() + 11);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }, [thisWeekStart.getTime()]);

  const nextVisitId = useMemo(() => {
    const upcoming = visits
      .filter((v) => v.scheduled_start && !v.completed_at && new Date(v.scheduled_start) >= new Date())
      .sort((a, b) => (a.scheduled_start ?? '').localeCompare(b.scheduled_start ?? ''));
    return upcoming[0]?.id ?? null;
  }, [visits]);

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;

  const greeting = me?.first_name ? `${es ? 'Hola' : 'Hi'}, ${me.first_name}` : (es ? 'Su agenda' : 'Your schedule');
  const todayKey = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date());
  const routeVisits = inWeek.filter(v => routeRange === 'week' || (v.scheduled_start && new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(v.scheduled_start)) === todayKey)).sort((a,b)=>(a.scheduled_start??'').localeCompare(b.scheduled_start??''));

  return (
    <ProShell title={greeting} showBell unread={unread}>
      <ProPartnerStrip />
      <p className="px-[18px] pt-4 text-[14px] font-semibold text-[hsl(var(--pro-ink))]">
        You choose your days and your area. Once customers are booked on a day, changes need 14 days' notice.
      </p>
      {coi && (coi.status === "expired" || coi.status === "none") && (
        <WarningBanner
          pulse
          title={coi.status === "expired" ? "Your certificate of insurance has expired" : "No certificate of insurance on file"}
          body={
            coi.status === "expired" && coi.expires_at
              ? `Your COI expired ${new Date(coi.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. You can view upcoming visits, but you can't start one until a valid certificate is on file.`
              : "You can view upcoming visits, but you can't start one until a valid certificate is on file."
          }
          action={
            <ProButton variant="secondary" onClick={() => (window.location.href = "/pro/profile")}>
              Upload certificate
            </ProButton>
          }
        />
      )}

      <ProLaunchLine className="px-[18px] pt-3" />
      {loading && <ScheduleSkeleton />}

      {!loading && error && <ErrorState title="Couldn't load your schedule" onRetry={reload} />}

      {!loading && !error && (
        <>
          <section className="space-y-3 px-[18px] pt-4">
            <div className="flex gap-2" role="group" aria-label={es?'Visitas':'Visits'}>
              <Button variant={routeRange==='today'?'default':'outline'} onClick={()=>setRouteRange('today')}>{es?'Hoy':'Today'}</Button>
              <Button variant={routeRange==='week'?'default':'outline'} onClick={()=>setRouteRange('week')}>{es?'Esta semana':'This week'}</Button>
            </div>
            {routeVisits.length===0&&<p className="py-4 text-sm text-muted-foreground">{es?'Sin visitas programadas.':'No visits scheduled.'}</p>}
            {routeVisits.map((v,index)=><Link key={v.id} to={`/pro/visit/${v.id}`} className="flex min-h-24 items-start gap-3 rounded-lg border border-border bg-background p-4 text-foreground">
              <span className="pt-1 text-sm text-muted-foreground">{index+1}</span><div className="min-w-0 flex-1 space-y-1"><p className="font-semibold">{v.customer_first_name??(es?'Miembro':'Member')}</p><p className="text-sm">{v.service_type==='cleaning'?(es?'Limpieza':'Cleaning'):v.service_type==='lawn'?(es?'Césped':'Lawn'):v.visit_kind==='car_wash'?(es?'Lavado adicional':'Car Wash Add-On'):(es?'Cuidado del Auto':'Car Care')} · {v.size_tier===5?'Estate Plus':v.size_tier===4?'Estate':`${es?'Tamaño':'Size'} ${v.size_tier??'—'}`}</p><p className="text-xs text-muted-foreground">{timeWindow(v.scheduled_start,v.scheduled_end)} · {v.zip}</p>{v.is_team&&<p className="text-xs text-primary">{v.is_lead?(es?'Líder de equipo':'Team Lead'):(es?'Equipo':'Team')}</p>}</div><span className="text-sm font-semibold">{money(v.visit_pay_cents)}</span>
            </Link>)}
          </section>
          <section className="px-[18px] pt-4">
            <HeroPanel className="pro-rise">
              <Eyebrow className="text-[hsl(var(--pro-sky))]">This week</Eyebrow>
              <p className="pro-num pro-display mt-2 text-[34px] font-extrabold">{money(earnedCents)}</p>
              <p className="mt-1 text-[14px] text-white/70">
                {completedThisWeek.length} {completedThisWeek.length === 1 ? "visit" : "visits"} completed · pays{" "}
                {nextPayoutFriday}
              </p>
              <div className="mt-4 flex gap-6 border-t border-white/12 pt-3.5">
                <div>
                  <Eyebrow className="text-white/55">Visits all time</Eyebrow>
                  <p className="pro-num mt-1 text-[18px] font-bold">{me?.completed_visits ?? 0}</p>
                </div>
                <div>
                  <Eyebrow className="text-white/55">Insurance</Eyebrow>
                  <p className="mt-1 text-[18px] font-bold">{COI_LABEL[coi?.status ?? "none"]}</p>
                </div>
              </div>
            </HeroPanel>
          </section>

          <div className="mx-[18px] mt-5 flex rounded-xl border border-[hsl(var(--pro-navy)/0.07)] bg-white p-1 pro-card" role="tablist">
            {([["route", "My weekly route"], ["dates", "My dates"]] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`min-h-[44px] flex-1 rounded-[10px] text-[14px] font-bold ${tab === k ? "bg-[hsl(var(--pro-navy))] text-white" : "text-[hsl(var(--pro-ink-soft))]"}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "route" && <WeeklyRoute />}
          {tab === "dates" && <MyDates />}
          {tab === "dates" && (<>
          <div className="mx-[18px] mt-5 flex rounded-xl border border-[hsl(var(--pro-navy)/0.07)] bg-white p-1 pro-card">
            {(["this", "next"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeek(w)}
                className={`min-h-[44px] flex-1 rounded-[10px] text-[14px] font-bold transition-colors ${
                  week === w
                    ? "bg-[hsl(var(--pro-blue))] text-white shadow-[0_4px_12px_hsl(var(--pro-blue)/0.25)]"
                    : "text-[hsl(var(--pro-ink-soft))]"
                }`}
              >
                {w === "this" ? "This week" : "Next week"}
              </button>
            ))}
          </div>

          {grouped.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={week === "this" ? "Nothing scheduled this week" : "Nothing scheduled next week"}
              body="New visits appear here as soon as Tidy assigns them to you."
            />
          ) : (
            <div className="space-y-6 px-[18px] pt-5">
              {grouped.map(([day, rows]) => (
                <section key={day}>
                  <div className="flex items-center gap-3 pb-2.5">
                    <h2 className="pro-eyebrow text-[hsl(var(--pro-ink))]">{day}</h2>
                    <span aria-hidden className="h-px flex-1 bg-[hsl(var(--pro-navy)/0.08)]" />
                    <span className="pro-num text-[12px] font-semibold text-[hsl(var(--pro-ink-soft))]">
                      {rows.length} {rows.length === 1 ? "visit" : "visits"}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)] bg-white pro-card">
                    {rows.map((v) => (
                      <VisitRow
                        key={v.id}
                        to={`/pro/visit/${v.id}`}
                        service={v.service_type}
                        street={v.customer_first_name}
                        zip={v.zip}
                        window={timeWindow(v.scheduled_start, v.scheduled_end)}
                        payCents={v.visit_pay_cents}
                        isNext={v.id === nextVisitId}
                        completed={!!v.completed_at}
                        sample={v.is_sample}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          </>)}
        </>
      )}

      {!loading && !error && showPushCard && (
        <section className="px-[18px] pt-6">
          <PushOptIn compact />
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(PUSH_CARD_KEY, "1");
              setShowPushCard(false);
            }}
            className="mt-2 min-h-[44px] w-full text-[13px] font-semibold text-[hsl(var(--pro-ink-soft))]"
          >
            Not now
          </button>
        </section>
      )}

      <InstallPrompt />
    </ProShell>
  );
}
