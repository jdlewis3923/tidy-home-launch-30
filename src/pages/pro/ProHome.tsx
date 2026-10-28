/**
 * Pro Home — /pro/home. Daily command center: today's assigned visits,
 * estimated pay, readiness (insurance, GPS) and one primary action.
 * Reads only Pro-scoped data via useProSession; no new backend.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, Car, ChevronRight, DollarSign, Home as HomeIcon, Leaf, MapPin, ShieldCheck, ShieldAlert } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import InstallPrompt from "@/components/pro/portal/InstallPrompt";
import { useProSession } from "@/hooks/useProSession";
import { fetchNotifications, mondayOf, timeWindow, type ProVisit } from "@/lib/pro-portal";
import { money } from "@/lib/pro-pay";
import { useLanguage } from "@/contexts/LanguageContext";

const TZ = "America/New_York";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

function serviceMeta(v: ProVisit, es: boolean) {
  if (v.service_type === "lawn") return { label: es ? "Césped" : "Lawn Care", Icon: Leaf, tone: "--pro-green" };
  if (v.service_type === "cleaning") return { label: es ? "Limpieza del hogar" : "Home Cleaning", Icon: HomeIcon, tone: "--pro-blue" };
  return { label: v.visit_kind === "car_wash" ? (es ? "Lavado adicional" : "Car Wash Add-On") : (es ? "Cuidado del Auto" : "Car Care"), Icon: Car, tone: "--pro-car" };
}

export default function ProHome() {
  const { me, coi, isOwner, visits, loading, userId } = useProSession();
  const { language } = useLanguage();
  const es = language === "es";
  const reduce = useReducedMotion();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!userId) return;
    void fetchNotifications().then((n) => setUnread(n.filter((x) => !x.read_at).length)).catch(() => setUnread(0));
  }, [userId]);

  const today = dayKey(new Date());
  const todays = useMemo(() => visits
    .filter((v) => v.scheduled_start && !["canceled", "skipped", "blocked"].includes(v.status ?? "") && dayKey(new Date(v.scheduled_start)) === today)
    .sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? "")), [visits, today]);
  const open = todays.filter((v) => !v.completed_at);
  const next = open[0] ?? null;
  const todayPay = todays.reduce((s, v) => s + (v.visit_pay_cents ?? 0), 0);

  const weekStart = mondayOf(new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  const weekCount = visits.filter((v) => v.scheduled_start && new Date(v.scheduled_start) >= weekStart && new Date(v.scheduled_start) < weekEnd).length;
  const weekEarned = visits.filter((v) => v.completed_at && new Date(v.completed_at) >= weekStart).reduce((s, v) => s + (v.visit_pay_cents ?? 0), 0);
  const tier2 = me?.tier === "tier_2_pro" || me?.tier === "tier_2";

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;

  const coiBlocked = !isOwner && !!coi && !coi.can_work;
  const routeUrl = (() => {
    const stops = open.map((v) => [v.street, v.zip].filter(Boolean).join(", ")).filter(Boolean);
    if (!stops.length) return null;
    const dest = encodeURIComponent(stops[stops.length - 1]);
    const way = stops.slice(0, -1).map(encodeURIComponent).join("|");
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}${way ? `&waypoints=${way}` : ""}&travelmode=driving`;
  })();

  const dateLabel = new Date().toLocaleDateString(es ? "es-US" : "en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
  const greeting = me?.first_name ? `${es ? "Hola" : "Hi"}, ${me.first_name}` : (es ? "Hola" : "Hi");
  const rise = (i: number) => reduce ? {} : { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.24, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } };

  const coiLabel = coi?.status === "active" ? (es ? "Seguro activo" : "Insurance active")
    : coi?.status === "expiring" ? (es ? "Seguro por vencer" : "Insurance expiring")
    : coi?.status === "under_review" ? (es ? "Seguro en revisión" : "Insurance under review")
    : coi?.status === "expired" ? (es ? "Seguro vencido" : "Insurance expired") : (es ? "Sin seguro" : "No insurance");

  return (
    <ProShell title={greeting} showBell unread={unread} dark>
      <div className="bg-[hsl(var(--pro-deep-2))] px-4 py-3">
        <p className="text-[15px] font-semibold text-primary-foreground">{dateLabel}</p>
      </div>

      <div className="px-2.5 pt-2.5">
        <motion.section {...rise(0)} className="rounded-[16px] bg-white p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-[hsl(var(--pro-ink))]">{es ? "Trabajos de hoy" : "Today’s jobs"}</h2>
              <p className="text-[12.5px] text-[hsl(var(--pro-blue))]">{todays.length} {es ? (todays.length === 1 ? "programado" : "programados") : "scheduled"}{todayPay > 0 && <span className="text-[hsl(var(--pro-ink-soft))]"> · {es ? "est." : "est."} {money(todayPay)}</span>}</p>
            </div>
            <Link to="/pro/schedule" className="flex min-h-[32px] items-center gap-2 rounded-[9px] bg-[hsl(var(--pro-blue))] px-3 text-[12.5px] font-medium text-primary-foreground">
              {es ? "Ver todo" : "View all"} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <div className="mt-3 space-y-2.5">
            {loading && [0, 1].map((i) => <div key={i} className="h-[84px] animate-pulse rounded-[12px] bg-[hsl(var(--pro-ground))]" />)}
            {!loading && todays.length === 0 && (
              <div className="rounded-[12px] border border-[hsl(var(--pro-line))] p-4 text-[13.5px] text-[hsl(var(--pro-ink-soft))]">
                {es ? "No tiene trabajos asignados hoy. Las visitas aparecen aquí cuando Tidy se las asigna." : "No jobs assigned today. Visits appear here as soon as Tidy assigns them."}
              </div>
            )}
            {todays.map((v, i) => {
              const m = serviceMeta(v, es);
              const isNext = v.id === next?.id;
              return (
                <motion.div key={v.id} {...rise(i + 1)}>
                  <Link to={`/pro/visit/${v.id}`}
                    className={`flex items-center gap-3 rounded-[12px] border border-l-[3px] bg-white py-3 pl-3 pr-2 ${v.completed_at ? "opacity-60" : ""}`}
                    style={{ borderColor: "hsl(var(--pro-line))", borderLeftColor: `hsl(var(${m.tone}))` }}>
                    <m.Icon className="h-7 w-7 shrink-0" style={{ color: `hsl(var(${m.tone}))` }} aria-hidden strokeWidth={2} fill={m.tone === "--pro-car" ? "none" : `hsl(var(${m.tone}))`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-[hsl(var(--pro-ink))]">{timeWindow(v.scheduled_start, v.scheduled_end, language)}</p>
                      <p className="text-[13px] font-medium text-[hsl(var(--pro-ink))]">{m.label}{v.is_team && <span className="ml-1.5 text-[11px] font-semibold text-[hsl(var(--pro-blue))]">{v.is_lead ? (es ? "Líder" : "Lead") : (es ? "Equipo" : "Team")}</span>}</p>
                      <p className="truncate text-[12px] text-[hsl(var(--pro-ink-soft))]">{v.street ?? v.customer_first_name ?? "—"}</p>
                      <p className="text-[12px] text-[hsl(var(--pro-ink-soft))]">{v.zip}{v.visit_pay_cents ? ` · ${money(v.visit_pay_cents)}` : ""}{isNext && <span className="ml-1.5 font-semibold text-[hsl(var(--pro-blue))]">· {es ? "Siguiente" : "Next"}</span>}{v.completed_at && <span className="ml-1.5 font-semibold text-[hsl(var(--pro-green))]">· {es ? "Hecho" : "Done"}</span>}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[hsl(var(--pro-blue))]" aria-hidden />
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {/* Readiness */}
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px] font-medium">
            {!isOwner && <Link to="/pro/profile" className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${coiBlocked ? "bg-[hsl(var(--pro-red-soft))] text-[hsl(var(--pro-red))]" : "bg-[hsl(var(--pro-green-soft))] text-[hsl(var(--pro-green))]"}`}>
              {coiBlocked ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}{coiLabel}
            </Link>}
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--pro-blue-soft))] px-2.5 py-1 text-[hsl(var(--pro-blue))]">
              <MapPin className="h-3.5 w-3.5" aria-hidden />{es ? "GPS al llegar (150 m)" : "GPS check-in on arrival (150 m)"}
            </span>
          </div>

          {/* Single primary action */}
          <div className="mt-3 flex gap-2.5">
            {coiBlocked ? (
              <Link to="/pro/profile" className="flex min-h-[48px] flex-1 items-center justify-center gap-3 rounded-[12px] bg-[hsl(var(--pro-blue))] text-[15px] font-medium text-primary-foreground">
                {es ? "Subir certificado de seguro" : "Upload insurance certificate"} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : routeUrl ? (
              <a href={routeUrl} target="_blank" rel="noreferrer" className="flex min-h-[48px] flex-1 items-center justify-center gap-6 rounded-[12px] bg-[hsl(var(--pro-blue))] text-[15px] font-medium text-primary-foreground active:scale-[0.99]">
                {es ? "Iniciar ruta" : "Start Route"} <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            ) : (
              <Link to="/pro/schedule" className="flex min-h-[48px] flex-1 items-center justify-center gap-6 rounded-[12px] bg-[hsl(var(--pro-blue))] text-[15px] font-medium text-primary-foreground">
                {es ? "Ver mi semana" : "View my week"} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
            <Link to="/pro/status" aria-label={es ? "Mi insignia" : "My badge"} className="grid h-12 w-12 place-items-center rounded-[12px] bg-[hsl(var(--pro-blue-soft))] text-[hsl(var(--pro-blue))]">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </Link>
          </div>

          {/* Tiles */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { to: "/pro/schedule", Icon: CalendarDays, t: es ? "Agenda" : "Schedule", s: es ? `${weekCount} esta semana` : "This week" },
              { to: "/pro/earnings", Icon: DollarSign, t: es ? "Pagos" : "Earnings", s: `${money(weekEarned)} ${es ? "esta semana" : "this week"}` },
              { to: "/pro/status", Icon: ShieldCheck, t: es ? "Estado" : "Status", s: tier2 ? (es ? "Nivel 2" : "Tier 2") : (es ? "Nivel 1" : "Tier 1") },
            ].map(({ to, Icon, t, s }) => (
              <Link key={to} to={to} className="flex min-h-[80px] flex-col items-center justify-center rounded-[12px] border border-[hsl(var(--pro-line))] bg-white px-1 text-center">
                <Icon className="h-5 w-5 text-[hsl(var(--pro-blue))]" aria-hidden />
                <span className="mt-1.5 text-[12.5px] font-semibold text-[hsl(var(--pro-ink))]">{t}</span>
                <span className="text-[11px] text-[hsl(var(--pro-ink-soft))]">{s}</span>
              </Link>
            ))}
          </div>
        </motion.section>
      </div>
      <InstallPrompt />
    </ProShell>
  );
}
