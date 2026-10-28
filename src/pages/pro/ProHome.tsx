/**
 * Pro Home — /pro/home. Daily command center: today's assigned visits,
 * one primary action, shortcuts. Reads only Pro-scoped data via useProSession.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, Bell, CalendarDays, Camera, Car, ChevronDown, ChevronRight, DollarSign, FileText, Globe, Home as HomeIcon, Leaf, MapPin, Megaphone, MessageCircle, Play, ShieldCheck, Sparkles, X } from "lucide-react";
import ProHead from "@/components/pro/portal/ProHead";
import { ProBottomNav } from "@/components/pro/portal/ProShell";
import LanguageSheet from "@/components/pro/portal/LanguageSheet";
import InstallPrompt from "@/components/pro/portal/InstallPrompt";
import { useProSession } from "@/hooks/useProSession";
import { fetchNotifications, timeWindow, mondayOf, type ProVisit } from "@/lib/pro-portal";
import { money } from "@/lib/pro-pay";
import { useLanguage } from "@/contexts/LanguageContext";
import palms from "@/assets/pro-home-palms.jpg";
import tidyLogo from "@/assets/tidy-official-logo.png";

const TZ = "America/New_York";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const NOTIF_KEY = "tidy-pro-stay-ready-dismissed";

function serviceMeta(v: ProVisit, es: boolean) {
  if (v.service_type === "lawn") return { label: es ? "Césped" : "Lawn Care", Icon: Leaf, tone: "--pro-green" };
  if (v.service_type === "cleaning") return { label: es ? "Limpieza del hogar" : "Home Cleaning", Icon: HomeIcon, tone: "--pro-blue" };
  return { label: v.visit_kind === "car_wash" ? (es ? "Lavado adicional" : "Car Wash Add-On") : (es ? "Cuidado del Auto" : "Car Care"), Icon: Car, tone: "--pro-car" };
}

function weatherIcon(w: number) {
  return w === 0 ? "☀️" : w <= 3 ? "⛅" : w <= 48 ? "🌫️" : w <= 67 || (w >= 80 && w <= 82) ? "🌧️" : w >= 95 ? "⛈️" : "☁️";
}

export default function ProHome() {
  const { me, coi, isOwner, gettingStarted, visits, loading, userId } = useProSession();
  const { language } = useLanguage();
  const es = language === "es";
  const reduce = useReducedMotion();
  const [sheet, setSheet] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!userId) return;
    void fetchNotifications().then((n) => setUnread(n.filter((x) => !x.read_at).length)).catch(() => setUnread(0));
  }, [userId]);

  const [weather, setWeather] = useState<{ temp: number; hi: number; lo: number; icon: string } | null>(null);
  useEffect(() => {
    // Live Pinecrest, FL conditions (Open-Meteo). Hidden if unavailable — never a guessed value.
    fetch("https://api.open-meteo.com/v1/forecast?latitude=25.667&longitude=-80.308&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=1")
      .then((r) => r.json()).then((j) => {
        const c = j?.current; if (typeof c?.temperature_2m !== "number") return;
        setWeather({ temp: Math.round(c.temperature_2m), hi: Math.round(j.daily?.temperature_2m_max?.[0] ?? c.temperature_2m), lo: Math.round(j.daily?.temperature_2m_min?.[0] ?? c.temperature_2m), icon: weatherIcon(c.weather_code) });
      }).catch(() => setWeather(null));
  }, []);

  const [showReady, setShowReady] = useState(() => {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem(NOTIF_KEY)) return false;
    return !("Notification" in window) || Notification.permission !== "granted";
  });
  const dismissReady = () => { localStorage.setItem(NOTIF_KEY, "1"); setShowReady(false); };
  const enableNotifs = async () => {
    try { if ("Notification" in window) { const p = await Notification.requestPermission(); if (p === "granted") dismissReady(); } } catch { /* unsupported */ }
  };

  const today = dayKey(new Date());
  const todays = useMemo(() => visits
    .filter((v) => v.scheduled_start && !["canceled", "skipped", "blocked"].includes(v.status ?? "") && dayKey(new Date(v.scheduled_start)) === today)
    .sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? "")), [visits, today]);
  const open = todays.filter((v) => !v.completed_at);
  const next = open[0] ?? null;
  const weekStart = mondayOf(new Date());
  const weekEarned = visits.filter((v) => v.completed_at && new Date(v.completed_at) >= weekStart).reduce((s, v) => s + (v.visit_pay_cents ?? 0), 0);
  const tier2 = me?.tier === "tier_2_pro" || me?.tier === "tier_2";

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;
  if (!loading && gettingStarted) return <Navigate to="/pro/onboarding" replace />;

  const coiBlocked = !isOwner && !!coi && !coi.can_work;
  const routeUrl = (() => {
    const stops = open.map((v) => [v.street, v.zip].filter(Boolean).join(", ")).filter(Boolean);
    if (!stops.length) return null;
    const dest = encodeURIComponent(stops[stops.length - 1]);
    const way = stops.slice(0, -1).map(encodeURIComponent).join("|");
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}${way ? `&waypoints=${way}` : ""}&travelmode=driving`;
  })();

  const now = new Date();
  const weekday = now.toLocaleDateString(es ? "es-US" : "en-US", { timeZone: TZ, weekday: "long" });
  const monthDay = now.toLocaleDateString(es ? "es-US" : "en-US", { timeZone: TZ, month: "short", day: "numeric" });
  const name = (me as { first_name?: string | null; last_name?: string | null } | null);
  const initials = `${name?.first_name?.[0] ?? ""}${name?.last_name?.[0] ?? ""}`.toUpperCase() || "T";
  const rise = (i: number) => reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.28, delay: 0.06 * i, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } };
  const card = "rounded-[22px] bg-white shadow-[0_8px_24px_-14px_hsl(var(--pro-navy)/0.25)]";

  const primaryCls = "flex min-h-[52px] w-full items-center rounded-[16px] bg-[hsl(var(--pro-blue))] px-5 text-[17px] font-semibold text-primary-foreground shadow-[0_12px_22px_-12px_hsl(var(--pro-blue)/0.9)] transition-transform active:scale-[0.98]";
  const primaryInner = (label: string) => (<><Play className="h-6 w-6" fill="currentColor" aria-hidden /><span className="flex-1 text-center">{label}</span><ArrowRight className="h-5 w-5" aria-hidden /></>);
  const startLabel = es ? "Iniciar ruta" : "Start Route";

  return (
    <div className="min-h-screen bg-[hsl(var(--pro-ground))] font-sans">
      <ProHead title={`${es ? "Inicio" : "Home"} · Tidy Pro Portal`} />
      <main className="mx-auto max-w-md px-3 pb-28 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-2 px-1 pb-3">
          <div className="flex flex-1 items-center gap-1.5">
            <img src={tidyLogo} alt="Tidy Home Concierge" width={212} height={177} loading="eager" decoding="async"
              className="h-11 w-auto max-w-none shrink-0 object-contain" />
            <span className="rounded-full bg-[hsl(var(--pro-gold,45_92%_52%))] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--pro-ink))]">PRO</span>
          </div>
          <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-label={es ? "Idioma" : "Language"}
            className="flex h-10 items-center gap-1.5 rounded-full bg-[hsl(var(--pro-blue-soft))] px-3 text-[13px] font-semibold text-[hsl(var(--pro-ink))]">
            <Globe className="h-4 w-4" aria-hidden />{es ? "EN" : "ES"}<ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
          <Link to="/pro/notifications" aria-label={es ? "Notificaciones" : "Notifications"} className="relative grid h-10 w-10 place-items-center text-[hsl(var(--pro-ink))]">
            <Bell className="h-[22px] w-[22px]" aria-hidden strokeWidth={1.9} />
            {unread > 0 && <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-[hsl(var(--pro-blue))] ring-2 ring-[hsl(var(--pro-ground))]" />}
          </Link>
          <Link to="/pro/profile" aria-label={es ? "Perfil" : "Profile"} className="grid h-10 w-10 place-items-center rounded-full bg-[hsl(var(--pro-line))] text-[13px] font-semibold text-[hsl(var(--pro-ink))]">{initials}</Link>
        </header>

        <motion.section {...rise(0)} className="relative h-[100px] overflow-hidden rounded-[20px] text-primary-foreground">
          <img src={palms} alt="" width={1536} height={640} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--pro-navy)/0.55),transparent_70%)]" />
          <div className="relative flex h-full items-center justify-between px-4">
            <div className="leading-tight">
              <p className="text-[13px] capitalize">{weekday}</p>
              <p className="text-[26px] font-extrabold capitalize tracking-[-0.02em]">{monthDay}</p>
              <p className="flex items-center gap-1 text-[11.5px]"><MapPin className="h-3.5 w-3.5" aria-hidden />Pinecrest, FL</p>
            </div>
            {weather && (
              <div className="text-right drop-shadow">
                <p className="flex items-center justify-end gap-1 text-[28px] font-extrabold leading-none"><span aria-hidden className="text-[24px]">{weather.icon}</span>{weather.temp}°</p>
                <p className="mt-1 text-[11.5px] font-medium">H {weather.hi}°&nbsp; L {weather.lo}°</p>
              </div>
            )}
          </div>
        </motion.section>

        <motion.section {...rise(1)} className={`mt-3 p-4 ${card}`}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[21px] font-extrabold tracking-[-0.02em] text-[hsl(var(--pro-ink))]">{es ? "Trabajos de hoy" : "Today’s Jobs"}</h2>
              <p className="text-[13px] text-[hsl(var(--pro-ink-soft))]"><span className="mr-1 text-[15px] font-bold text-[hsl(var(--pro-blue))]">{todays.length}</span>{es ? (todays.length === 1 ? "programado" : "programados") : "scheduled"}</p>
            </div>
            <Link to="/pro/schedule" className="flex h-9 items-center gap-2 rounded-[12px] bg-[hsl(var(--pro-blue-soft))] px-3 text-[13.5px] font-semibold text-[hsl(var(--pro-blue))]">
              {es ? "Ver todo" : "View All"}<ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="mt-3 space-y-2.5">
            {loading && [0, 1].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-[14px] bg-[hsl(var(--pro-ground))]" />)}
            {!loading && todays.length === 0 && (
              <div className="flex flex-col items-center py-5 text-center">
                <span className="relative text-[hsl(var(--pro-ink-soft))]">
                  <CalendarDays className="h-12 w-12" strokeWidth={1.6} aria-hidden />
                  <Sparkles className="absolute -bottom-1 -right-2 h-5 w-5 text-[hsl(var(--pro-blue))]" fill="currentColor" aria-hidden />
                </span>
                <p className="mt-3 text-[15px] font-bold text-[hsl(var(--pro-ink))]">{es ? "No hay trabajos asignados hoy" : "No jobs assigned today"}</p>
                <p className="mt-1 max-w-[230px] text-[12.5px] text-[hsl(var(--pro-ink-soft))]">{es ? "Las visitas aparecerán aquí en cuanto Tidy las asigne." : "Visits will appear here as soon as Tidy assigns them."}</p>
              </div>
            )}
            {todays.map((v, i) => {
              const m = serviceMeta(v, es);
              return (
                <motion.div key={v.id} {...rise(i + 2)}>
                  <Link to={`/pro/visit/${v.id}`} className={`flex items-center gap-3 rounded-[14px] border border-[hsl(var(--pro-line))] bg-white p-3 ${v.completed_at ? "opacity-60" : ""}`}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: `hsl(var(${m.tone}) / 0.12)`, color: `hsl(var(${m.tone}))` }}><m.Icon className="h-5 w-5" aria-hidden /></span>
                    <div className="min-w-0 flex-1 leading-snug">
                      <p className="text-[14px] font-semibold text-[hsl(var(--pro-ink))]">{timeWindow(v.scheduled_start, v.scheduled_end, language)} · {m.label}{v.is_team && <span className="ml-1.5 text-[11px] text-[hsl(var(--pro-blue))]">{v.is_lead ? (es ? "Líder" : "Lead") : (es ? "Equipo" : "Team")}</span>}</p>
                      <p className="truncate text-[12.5px] text-[hsl(var(--pro-ink-soft))]">{[v.street ?? v.customer_first_name, v.zip].filter(Boolean).join(" · ")}{v.completed_at && <span className="ml-1.5 font-semibold text-[hsl(var(--pro-green))]">· {es ? "Hecho" : "Done"}</span>}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-[hsl(var(--pro-blue))]" aria-hidden />
                  </Link>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-3">
            {coiBlocked ? <Link to="/pro/upload-coi" className={primaryCls}>{primaryInner(es ? "Subir certificado de seguro" : "Upload insurance certificate")}</Link>
              : routeUrl ? <a href={routeUrl} target="_blank" rel="noreferrer" className={primaryCls}>{primaryInner(startLabel)}</a>
              : <Link to="/pro/schedule" className={primaryCls}>{primaryInner(startLabel)}</Link>}
          </div>
        </motion.section>

        <motion.div {...rise(2)} className="mt-3 grid grid-cols-3 gap-2">
          {[
            { to: "/pro/schedule", Icon: CalendarDays, t: es ? "Agenda" : "Schedule", s: es ? "Esta semana" : "This week", tone: "--pro-blue" },
            { to: "/pro/earnings", Icon: DollarSign, t: es ? "Pagos" : "Earnings", s: `${money(weekEarned)} ${es ? "esta semana" : "this week"}`, tone: "--pro-green" },
            { to: "/pro/status", Icon: BadgeCheck, t: es ? "Estado" : "Status", s: tier2 ? (es ? "Nivel 2" : "Tier 2") : (es ? "Nivel 1" : "Tier 1"), tone: "--pro-purple" },
          ].map(({ to, Icon, t, s, tone }) => (
            <Link key={to} to={to} className={`flex min-h-[100px] flex-col p-3 ${card}`}>
              <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: `hsl(var(${tone}, 262 83% 58%) / 0.12)`, color: `hsl(var(${tone}, 262 83% 58%))` }}><Icon className="h-5 w-5" aria-hidden /></span>
              <span className="mt-2 flex items-end justify-between gap-1">
                <span className="min-w-0 leading-tight">
                  <span className="block text-[14px] font-bold text-[hsl(var(--pro-ink))]">{t}</span>
                  <span className="block truncate text-[11.5px] text-[hsl(var(--pro-ink-soft))]">{s}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--pro-ink-soft))]" aria-hidden />
              </span>
            </Link>
          ))}
        </motion.div>

        {showReady && (
          <motion.section {...rise(3)} className="relative mt-3 rounded-[22px] bg-[hsl(var(--pro-blue-soft))] p-4">
            <button type="button" onClick={dismissReady} aria-label={es ? "Cerrar" : "Dismiss"} className="absolute right-3 top-3 grid h-8 w-8 place-items-center text-[hsl(var(--pro-ink-soft))]"><X className="h-5 w-5" aria-hidden /></button>
            <div className="flex gap-3 pr-6">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/70 text-[hsl(var(--pro-blue))]"><Megaphone className="h-6 w-6" fill="currentColor" aria-hidden /></span>
              <div>
                <p className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">{es ? "Manténgase listo" : "Stay ready"}</p>
                <p className="text-[12.5px] text-[hsl(var(--pro-ink-soft))]">{es ? "Active las notificaciones para no perderse ningún trabajo ni aviso." : "Turn on notifications so you never miss a new job or update."}</p>
              </div>
            </div>
            <button type="button" onClick={enableNotifs} className="mt-3 h-10 w-full rounded-[14px] bg-white text-[14px] font-semibold text-[hsl(var(--pro-blue))]">{es ? "Activar notificaciones" : "Enable Notifications"}</button>
          </motion.section>
        )}

        <motion.div {...rise(4)} className="mt-3 grid grid-cols-4 gap-2">
          {[
            { to: next ? `/pro/visit/${next.id}` : "/pro/schedule", Icon: FileText, t: es ? "Detalles" : "Job Details" },
            { to: next ? `/pro/visit/${next.id}/photos` : "/pro/schedule", Icon: Camera, t: es ? "Fotos" : "Upload Photos" },
            { to: "/pro/messages", Icon: MessageCircle, t: es ? "Soporte" : "Support" },
            { to: "/pro/profile", Icon: ShieldCheck, t: es ? "Seguridad" : "Safety & Docs" },
          ].map(({ to, Icon, t }) => (
            <Link key={t} to={to} className={`flex min-h-[78px] flex-col items-center justify-center gap-1.5 px-1 text-center ${card}`}>
              <Icon className="h-6 w-6 text-[hsl(var(--pro-ink))]" strokeWidth={1.7} aria-hidden />
              <span className="text-[10.5px] leading-tight text-[hsl(var(--pro-ink))]">{t}</span>
            </Link>
          ))}
        </motion.div>
      </main>
      <ProBottomNav />
      <LanguageSheet open={sheet} onClose={() => setSheet(false)} />
      <InstallPrompt />
    </div>
  );
}
