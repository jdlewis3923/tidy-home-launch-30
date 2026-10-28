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

const COI_LABEL: Record<string, [string,string]> = { none: ["Insurance","Seguro"], under_review: ["Under review","En revisión"], active: ["Active","Activo"], expiring: ["Expiring","Por vencer"], expired: ["Expired","Vencido"] };



export default function ProSchedule() {
  const { me, coi, visits, loading, error, reload, userId } = useProSession();
  const { language } = useLanguage();
  const es = language === 'es';
  const [routeRange,setRouteRange] = useState<'today'|'week'>('today');
  const [week, setWeek] = useState<"this" | "next">("this");
  const [tab, setTab] = useState<"route" | "dates">("dates");
  const [unread, setUnread] = useState(0);
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
    return d.toLocaleDateString(es ? "es-US" : "en-US", { month: "short", day: "numeric" });
  }, [thisWeekStart.getTime(), es]);

  const nextVisitId = useMemo(() => {
    const upcoming = visits
      .filter((v) => v.scheduled_start && !v.completed_at && new Date(v.scheduled_start) >= new Date())
      .sort((a, b) => (a.scheduled_start ?? '').localeCompare(b.scheduled_start ?? ''));
    return upcoming[0]?.id ?? null;
  }, [visits]);

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;

  const greeting = me?.first_name ? `${es ? 'Hola' : 'Hi'}, ${me.first_name}` : (es ? 'Su agenda' : 'Your schedule');
  const todayKey = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date());
  const routeVisits = visits.filter(v => {
    if (!v.scheduled_start || ['canceled','skipped','blocked'].includes(v.status ?? '')) return false;
    const key = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(v.scheduled_start));
    return routeRange === 'today' ? key === todayKey : new Date(v.scheduled_start) >= thisWeekStart && new Date(v.scheduled_start) < new Date(thisWeekStart.getTime()+7*86400000);
  }).sort((a,b)=>(a.scheduled_start??'').localeCompare(b.scheduled_start??''));

  return (
    <ProShell title={greeting} showBell unread={unread}>
      <ProPartnerStrip />
      <p className="px-[18px] pt-4 text-[14px] font-semibold text-[hsl(var(--pro-ink))]">
        {es ? "Usted elige sus días y su zona. Una vez que haya miembros reservados, los cambios requieren 14 días de aviso." : "You choose your days and your area. Once customers are booked on a day, changes need 14 days' notice."}
      </p>
      {coi && (coi.status === "expired" || coi.status === "none") && (
        <WarningBanner
          pulse
          title={coi.status === "expired" ? (es ? "Su certificado de seguro ha vencido" : "Your certificate of insurance has expired") : (es ? "No hay certificado de seguro registrado" : "No certificate of insurance on file")}
          body={es ? "Puede ver sus próximas visitas, pero no comenzar hasta tener un certificado de seguro válido." :
            coi.status === "expired" && coi.expires_at
              ? `Your COI expired ${new Date(coi.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. You can view upcoming visits, but you can't start one until a valid certificate is on file.`
              : "You can view upcoming visits, but you can't start one until a valid certificate is on file."
          }
          action={
            <ProButton variant="secondary" onClick={() => (window.location.href = "/pro/profile")}>
              {es ? "Subir certificado" : "Upload certificate"}
            </ProButton>
          }
        />
      )}

      <ProLaunchLine className="px-[18px] pt-3" />
      {loading && <ScheduleSkeleton />}

      {!loading && error && <ErrorState title={es ? "No se pudo cargar su agenda" : "Couldn't load your schedule"} onRetry={reload} />}

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
              <Eyebrow className="text-[hsl(var(--pro-sky))]">{es ? "Esta semana" : "This week"}</Eyebrow>
              <p className="pro-num pro-display mt-2 text-[34px] font-extrabold">{money(earnedCents)}</p>
              <p className="mt-1 text-[14px] text-white/70">
                {completedThisWeek.length} {es ? (completedThisWeek.length === 1 ? "visita completa" : "visitas completas") : (completedThisWeek.length === 1 ? "visit completed" : "visits completed")} · {es ? "pago" : "pays"}{" "}
                {nextPayoutFriday}
              </p>
              <div className="mt-4 flex gap-6 border-t border-white/12 pt-3.5">
                <div>
                  <Eyebrow className="text-white/55">{es ? "Visitas totales" : "Visits all time"}</Eyebrow>
                  <p className="pro-num mt-1 text-[18px] font-bold">{me?.completed_visits ?? 0}</p>
                </div>
                <div>
                  <Eyebrow className="text-white/55">{es ? "Seguro" : "Insurance"}</Eyebrow>
                  <p className="mt-1 text-[18px] font-bold">{COI_LABEL[coi?.status ?? "none"]?.[es ? 1 : 0]}</p>
                </div>
              </div>
            </HeroPanel>
          </section>

          <div className="mx-[18px] mt-5 flex rounded-xl border border-[hsl(var(--pro-navy)/0.07)] bg-white p-1 pro-card" role="tablist">
            {([["route", es ? "Mi ruta semanal" : "My weekly route"], ["dates", es ? "Mis fechas" : "My dates"]] as const).map(([k, label]) => (
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
                {w === "this" ? (es ? "Esta semana" : "This week") : (es ? "Próxima semana" : "Next week")}
              </button>
            ))}
          </div>

          {grouped.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={week === "this" ? (es ? "Sin visitas esta semana" : "Nothing scheduled this week") : (es ? "Sin visitas la próxima semana" : "Nothing scheduled next week")}
              body={es ? "Las nuevas visitas aparecen cuando Tidy se las asigna." : "New visits appear here as soon as Tidy assigns them to you."}
            />
          ) : (
            <div className="space-y-6 px-[18px] pt-5">
              {grouped.map(([day, rows]) => (
                <section key={day}>
                  <div className="flex items-center gap-3 pb-2.5">
                    <h2 className="pro-eyebrow text-[hsl(var(--pro-ink))]">{day}</h2>
                    <span aria-hidden className="h-px flex-1 bg-[hsl(var(--pro-navy)/0.08)]" />
                    <span className="pro-num text-[12px] font-semibold text-[hsl(var(--pro-ink-soft))]">
                      {rows.length} {es ? (rows.length === 1 ? "visita" : "visitas") : (rows.length === 1 ? "visit" : "visits")}
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

      <InstallPrompt />
    </ProShell>
  );
}
