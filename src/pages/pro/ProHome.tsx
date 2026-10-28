/**
 * Pro Home — /pro/home. Daily command center: today's assigned visits,
 * estimated pay, readiness (insurance, GPS) and one primary action.
 * Reads only Pro-scoped data via useProSession; no new backend.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, Car, ChevronRight, DollarSign, Home as HomeIcon, Leaf, MapPin, ShieldCheck, BadgeCheck } from "lucide-react";
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

  const [weather, setWeather] = useState<{ temp: number; icon: string } | null>(null);
  useEffect(() => {
    // Live conditions for Pinecrest, FL (Open-Meteo, no key). Hidden if unavailable — never a guessed value.
    fetch("https://api.open-meteo.com/v1/forecast?latitude=25.667&longitude=-80.308&current=temperature_2m,weather_code&temperature_unit=fahrenheit")
      .then((r) => r.json()).then((j) => {
        const c = j?.current; if (typeof c?.temperature_2m !== "number") return;
        const w = c.weather_code as number;
        const icon = w === 0 ? "☀️" : w <= 3 ? "⛅" : w <= 48 ? "🌫️" : w <= 67 || (w >= 80 && w <= 82) ? "🌧️" : w >= 95 ? "⛈️" : "☁️";
        setWeather({ temp: Math.round(c.temperature_2m), icon });
      }).catch(() => setWeather(null));
  }, []);
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
      <div className="mx-2.5 flex items-center justify-between rounded-t-[14px] bg-[linear-gradient(180deg,hsl(var(--pro-deep-2)),hsl(var(--pro-deep)))] px-4 pb-6 pt-3.5">
        <p className="text-[17px] font-semibold tracking-[-0.01em] text-primary-foreground">{dateLabel}</p>
        {weather && (
          <div className="flex items-center gap-1.5 text-primary-foreground">
            <span aria-hidden className="text-[26px] leading-none">{weather.icon}</span>
            <div className="text-right leading-none">
              <p className="text-[19px] font-semibold">{weather.temp}°</p>
              <p className="mt-0.5 text-[9px] text-primary-foreground/80">Pinecrest, FL</p>
            </div>
          </div>
        )}
      </div>

      <motion.section {...rise(0)} className="-mt-3 min-h-[calc(100vh-150px)] rounded-t-[18px] bg-[hsl(var(--pro-ground))] px-3.5 pb-6 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[21px] font-bold tracking-[-0.015em] text-[hsl(var(--pro-ink))]">{es ? "Trabajos de hoy" : "Today’s jobs"}</h2>
            <p className="text-[13px] text-[hsl(var(--pro-ink-soft))]"><span className="font-semibold text-[hsl(var(--pro-blue))]">{todays.length}</span> {es ? (todays.length === 1 ? "programado" : "programados") : "scheduled"}</p>
          </div>
          <Link to="/pro/schedule" className="flex min-h-[36px] items-center gap-3 rounded-[10px] bg-[linear-gradient(180deg,hsl(var(--pro-sky)),hsl(var(--pro-blue)))] px-3.5 text-[13.5px] font-medium text-primary-foreground shadow-[0_6px_14px_-6px_hsl(var(--pro-blue)/0.7)]">
            {es ? "Ver todo" : "View all"} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="mt-3.5 space-y-2.5">
          {loading && [0, 1].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-[14px] bg-white" />)}
          {!loading && todays.length === 0 && (
            <div className="rounded-[14px] border border-[hsl(var(--pro-line))] bg-white p-4 text-[13.5px] text-[hsl(var(--pro-ink-soft))] shadow-[0_4px_14px_-10px_hsl(var(--pro-navy)/0.35)]">
              {es ? "No tiene trabajos asignados hoy. Las visitas aparecen aquí cuando Tidy se las asigna." : "No jobs assigned today. Visits appear here as soon as Tidy assigns them."}
            </div>
          )}
          {todays.map((v, i) => {
            const m = serviceMeta(v, es);
            return (
              <motion.div key={v.id} {...rise(i + 1)}>
                <Link to={`/pro/visit/${v.id}`}
                  className={`flex items-center gap-4 rounded-[14px] border border-l-[3px] bg-white py-3.5 pl-4 pr-3 shadow-[0_4px_14px_-10px_hsl(var(--pro-navy)/0.35)] ${v.completed_at ? "opacity-60" : ""}`}
                  style={{ borderColor: "hsl(var(--pro-line))", borderLeftColor: `hsl(var(${m.tone}))` }}>
                  <m.Icon className="h-9 w-9 shrink-0" style={{ color: `hsl(var(${m.tone}))` }} aria-hidden strokeWidth={1.6} fill={m.tone === "--pro-car" ? "none" : `hsl(var(${m.tone}))`} />
                  <div className="min-w-0 flex-1 leading-snug">
                    <p className="text-[14.5px] font-semibold text-[hsl(var(--pro-ink))]">{timeWindow(v.scheduled_start, v.scheduled_end, language)}</p>
                    <p className="text-[14px] font-semibold text-[hsl(var(--pro-ink))]">{m.label}{v.is_team && <span className="ml-1.5 text-[11px] text-[hsl(var(--pro-blue))]">{v.is_lead ? (es ? "Líder" : "Lead") : (es ? "Equipo" : "Team")}</span>}</p>
                    <p className="truncate text-[12.5px] text-[hsl(var(--pro-ink-soft))]">{v.street ?? v.customer_first_name ?? "—"}</p>
                    <p className="text-[12.5px] text-[hsl(var(--pro-ink-soft))]">{v.zip}{v.completed_at && <span className="ml-1.5 font-semibold text-[hsl(var(--pro-green))]">· {es ? "Hecho" : "Done"}</span>}</p>
                  </div>
                  <ChevronRight className="h-6 w-6 shrink-0 text-[hsl(var(--pro-blue))]" aria-hidden />
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2.5">
          {(() => {
            const cls = "flex min-h-[54px] flex-1 items-center justify-between rounded-[14px] bg-[linear-gradient(180deg,hsl(var(--pro-sky)),hsl(var(--pro-blue)))] pl-[30%] pr-5 text-[16px] font-semibold text-primary-foreground shadow-[0_10px_20px_-10px_hsl(var(--pro-blue)/0.8)] active:scale-[0.99]";
            if (coiBlocked) return <Link to="/pro/profile" className={cls.replace("pl-[30%]", "pl-5")}>{es ? "Subir certificado de seguro" : "Upload insurance certificate"} <ArrowRight className="h-5 w-5" aria-hidden /></Link>;
            if (routeUrl) return <a href={routeUrl} target="_blank" rel="noreferrer" className={cls}>{es ? "Iniciar ruta" : "Start Route"} <ArrowRight className="h-5 w-5" aria-hidden /></a>;
            return <Link to="/pro/schedule" className={cls}>{es ? "Iniciar ruta" : "Start Route"} <ArrowRight className="h-5 w-5" aria-hidden /></Link>;
          })()}
          <Link to="/pro/status" aria-label={es ? "Mi insignia" : "My badge"} className="grid h-[54px] w-[54px] place-items-center rounded-[14px] bg-[hsl(var(--pro-blue-soft))] text-[hsl(var(--pro-blue))]">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { to: "/pro/schedule", Icon: CalendarDays, t: es ? "Agenda" : "Schedule", s: es ? "Esta semana" : "This week", fill: true },
            { to: "/pro/earnings", Icon: DollarSign, t: es ? "Pagos" : "Earnings", s: `${money(weekEarned)} ${es ? "esta semana" : "this week"}`, fill: false },
            { to: "/pro/status", Icon: BadgeCheck, t: es ? "Estado" : "Status", s: tier2 ? (es ? "Nivel 2" : "Tier 2") : (es ? "Nivel 1" : "Tier 1"), fill: true },
          ].map(({ to, Icon, t, s, fill }) => (
            <Link key={to} to={to} className="flex min-h-[92px] flex-col items-center justify-center rounded-[14px] border border-[hsl(var(--pro-line))] bg-white px-1 text-center shadow-[0_4px_14px_-10px_hsl(var(--pro-navy)/0.35)]">
              <Icon className={`h-6 w-6 ${fill ? "text-[hsl(var(--pro-blue))]" : "text-[hsl(var(--pro-ink))]"}`} aria-hidden fill={fill ? "hsl(var(--pro-blue))" : "none"} stroke={fill ? "hsl(var(--pro-ground))" : "currentColor"} />
              <span className="mt-2 text-[14px] font-semibold text-[hsl(var(--pro-ink))]">{t}</span>
              <span className="text-[12px] text-[hsl(var(--pro-ink-soft))]">{s}</span>
            </Link>
          ))}
        </div>
      </motion.section>
      <InstallPrompt />
    </ProShell>
  );
}
