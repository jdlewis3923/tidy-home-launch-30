/**
 * Schedule — /pro/schedule. "My Week" month calendar (mockup screen 3):
 * dots on days with assigned visits, tap a day for its jobs, swipe/chevrons
 * to change month. Weekly route, availability and GPS test stay below.
 * COI banner: visits stay visible; starting one is blocked server-side.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Car, ChevronLeft, ChevronRight, Home as HomeIcon, Leaf, Plus } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import InstallPrompt from "@/components/pro/portal/InstallPrompt";
import ProLaunchLine from "@/components/pro/ProLaunchLine";
import { ErrorState, ScheduleSkeleton, WarningBanner, ProButton } from "@/components/pro/portal/kit";
import WeeklyRoute from "@/components/pro/schedule/WeeklyRoute";
import MyDates from "@/components/pro/schedule/MyDates";
import GpsTestCard from "@/components/pro/schedule/GpsTestCard";
import { useProSession } from "@/hooks/useProSession";
import { fetchNotifications, timeWindow, type ProVisit } from "@/lib/pro-portal";
import { useLanguage } from "@/contexts/LanguageContext";

const TZ = "America/New_York";
const keyOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

function meta(v: ProVisit, es: boolean) {
  if (v.service_type === "lawn") return { label: es ? "Césped" : "Lawn Care", Icon: Leaf, tone: "--pro-green" };
  if (v.service_type === "cleaning") return { label: es ? "Limpieza del hogar" : "Home Cleaning", Icon: HomeIcon, tone: "--pro-blue" };
  return { label: v.visit_kind === "car_wash" ? (es ? "Lavado adicional" : "Car Wash Add-On") : (es ? "Cuidado del Auto" : "Car Care"), Icon: Car, tone: "--pro-car" };
}

export default function ProSchedule() {
  const { me, coi, isOwner, visits, loading, error, reload, userId } = useProSession();
  const { language } = useLanguage();
  const es = language === "es";
  const reduce = useReducedMotion();
  const [unread, setUnread] = useState(0);
  const todayKey = keyOf(new Date());
  const [selected, setSelected] = useState(todayKey);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [dir, setDir] = useState(1);
  const datesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    void fetchNotifications().then((n) => setUnread(n.filter((x) => !x.read_at).length)).catch(() => setUnread(0));
  }, [userId]);

  const live = useMemo(() => visits.filter((v) => v.scheduled_start && !["canceled", "skipped", "blocked"].includes(v.status ?? "")), [visits]);
  const byDay = useMemo(() => {
    const m = new Map<string, ProVisit[]>();
    for (const v of live) { const k = keyOf(new Date(v.scheduled_start!)); m.set(k, [...(m.get(k) ?? []), v]); }
    for (const arr of m.values()) arr.sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? ""));
    return m;
  }, [live]);

  const cells = useMemo(() => {
    const start = new Date(month); start.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);
  const rows = cells.slice(35).every((d) => d.getMonth() !== month.getMonth()) ? cells.slice(0, 35) : cells;

  const shift = (n: number) => { setDir(n); setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1)); };

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;

  const greeting = me?.first_name ? `${es ? "Hola" : "Hi"}, ${me.first_name}` : (es ? "Su agenda" : "Your schedule");
  const loc = es ? "es-US" : "en-US";
  const monthLabel = month.toLocaleDateString(loc, { month: "short", year: "numeric" });
  const days = es ? ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayJobs = byDay.get(selected) ?? [];
  const selDate = new Date(`${selected}T12:00:00`);

  return (
    <ProShell title={greeting} showBell unread={unread} dark hideTitle>
      {!isOwner && coi && (coi.status === "expired" || coi.status === "none") && (
        <div className="px-2.5 pt-2.5">
          <WarningBanner
            title={coi.status === "expired" ? (es ? "Su certificado de seguro ha vencido" : "Your certificate of insurance has expired") : (es ? "No hay certificado de seguro registrado" : "No certificate of insurance on file")}
            body={es ? "Puede ver sus visitas, pero no comenzar hasta tener un certificado válido." : "You can view visits, but you can't start one until a valid certificate is on file."}
            action={<ProButton variant="secondary" onClick={() => (window.location.href = "/pro/profile")}>{es ? "Subir certificado" : "Upload certificate"}</ProButton>}
          />
        </div>
      )}

      <div className="mx-2.5 mt-1.5 min-h-[calc(100vh-110px)] rounded-t-[18px] bg-[hsl(var(--pro-ground))] px-1 pb-6">
        <section className="overflow-hidden px-2.5 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[24px] font-bold tracking-[-0.015em] text-[hsl(var(--pro-ink))]">{es ? "Mi semana" : "My Week"}</h2>
            <div className="flex h-[40px] items-center gap-3 rounded-[12px] border border-[hsl(var(--pro-line))] bg-white pl-4 pr-1 shadow-[0_4px_12px_-8px_hsl(var(--pro-navy)/0.3)]">
              <button type="button" onClick={() => shift(-1)} aria-label={es ? "Mes anterior" : "Previous month"} className="sr-only focus:not-sr-only"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
              <span className="text-[14px] font-medium capitalize text-[hsl(var(--pro-ink))]">{monthLabel}</span>
              <button type="button" onClick={() => shift(1)} aria-label={es ? "Mes siguiente" : "Next month"} className="grid h-9 w-9 place-items-center text-[hsl(var(--pro-ink))]"><ChevronRight className="h-[18px] w-[18px]" aria-hidden /></button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 text-center text-[13px] text-[hsl(var(--pro-ink))]">
            {days.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="relative mt-1 overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={month.toISOString()}
                custom={dir}
                initial={reduce ? { opacity: 0 } : { x: dir * 60, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { x: -dir * 60, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                drag={reduce ? false : "x"}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.25}
                onDragEnd={(_, info) => { if (info.offset.x < -50) shift(1); else if (info.offset.x > 50) shift(-1); }}
                className="mt-2 grid touch-pan-y grid-cols-7 gap-1"
              >
                {rows.map((d) => {
                  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  const inMonth = d.getMonth() === month.getMonth();
                  const isToday = k === todayKey;
                  const isSel = k === selected;
                  const has = byDay.has(k);
                  return (
                    <button key={k} type="button" onClick={() => setSelected(k)} aria-pressed={isSel}
                      aria-label={`${d.toLocaleDateString(loc, { weekday: "long", month: "long", day: "numeric" })}${has ? (es ? ", con visitas" : ", has visits") : ""}`}
                      className={`relative flex h-[50px] flex-col items-center justify-center rounded-[12px] transition-colors duration-150 ${inMonth ? "bg-white" : "bg-[hsl(var(--pro-line)/0.5)]"} ${isSel && !isToday ? "ring-[1.5px] ring-[hsl(var(--pro-blue))]" : ""}`}>
                      <motion.span layout={!reduce} className={`grid h-[38px] w-[38px] place-items-center rounded-full text-[15px] font-semibold ${isToday ? "bg-[linear-gradient(180deg,hsl(var(--pro-sky)),hsl(var(--pro-blue)))] text-primary-foreground shadow-[0_6px_12px_-6px_hsl(var(--pro-blue)/0.8)]" : inMonth ? "text-[hsl(var(--pro-ink))]" : "text-[hsl(var(--pro-ink-soft)/0.6)]"}`}>{d.getDate()}</motion.span>
                      <span aria-hidden className={`absolute bottom-[4px] h-[6px] w-[6px] rounded-full ${has ? "bg-[hsl(var(--pro-blue))]" : "bg-transparent"}`} />
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-y-1 border-b border-[hsl(var(--pro-line))] px-1 pb-4 text-[13px] text-[hsl(var(--pro-ink))]">
            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-[hsl(var(--pro-blue))]" />{es ? "Reservado" : "Booked"}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border-2 border-dashed border-[hsl(var(--pro-blue))]" />{es ? "Recuperación" : "Catch-up"}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-[hsl(var(--pro-red))]" />{es ? "Libre" : "Off"}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-[hsl(var(--pro-navy))]" />{es ? "Feriado" : "Holiday"}</span>
          </div>
        </section>

        <section className="relative px-2.5 pt-1">
          <h3 className="text-[20px] font-bold capitalize text-[hsl(var(--pro-ink))]">{selDate.toLocaleDateString(loc, { weekday: "short", month: "short", day: "numeric" })}</h3>
          {loading && <ScheduleSkeleton />}
          {!loading && error && <ErrorState title={es ? "No se pudo cargar su agenda" : "Couldn't load your schedule"} onRetry={reload} />}
          {!loading && !error && (
            <AnimatePresence mode="wait">
              <motion.div key={selected} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: EASE }} className="mt-2.5 space-y-2.5 pb-10">
                {dayJobs.length === 0 && <p className="rounded-[14px] border border-[hsl(var(--pro-line))] bg-white p-4 text-[13.5px] text-[hsl(var(--pro-ink-soft))]">{es ? "No tiene trabajos asignados este día." : "No jobs assigned this day."}</p>}
                {dayJobs.map((v, i) => {
                  const m = meta(v, es);
                  return (
                    <motion.div key={v.id} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 * i }}>
                      <Link to={`/pro/visit/${v.id}`} className="flex items-center gap-4 rounded-[14px] border border-l-[3px] bg-white py-3.5 pl-4 pr-3 shadow-[0_4px_14px_-10px_hsl(var(--pro-navy)/0.35)]" style={{ borderColor: "hsl(var(--pro-line))", borderLeftColor: `hsl(var(${m.tone}))` }}>
                        <m.Icon className="h-9 w-9 shrink-0" style={{ color: `hsl(var(${m.tone}))` }} fill={m.tone === "--pro-car" ? "none" : `hsl(var(${m.tone}))`} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] text-[hsl(var(--pro-ink))]">{timeWindow(v.scheduled_start, v.scheduled_end, language)}</p>
                          <p className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">{m.label}</p>
                          <p className="truncate text-[12px] text-[hsl(var(--pro-ink-soft))]">{v.street ?? v.zip ?? "—"}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-[hsl(var(--pro-blue))]" aria-hidden />
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          )}
          <button type="button" aria-label={es ? "Mi disponibilidad" : "My availability"} onClick={() => datesRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" })}
            className="fixed bottom-[78px] right-[max(1rem,calc(50%-14rem+1rem))] z-20 grid h-14 w-14 place-items-center rounded-full bg-[linear-gradient(180deg,hsl(var(--pro-sky)),hsl(var(--pro-blue)))] text-primary-foreground shadow-[0_10px_22px_-8px_hsl(var(--pro-blue)/0.85)] transition-transform active:scale-95">
            <Plus className="h-7 w-7" aria-hidden />
          </button>
        </section>

        {!loading && dayJobs.length === 0 && selected === todayKey && <div className="mx-2.5 mt-2.5"><GpsTestCard /></div>}

        <ProLaunchLine className="mx-2.5 mt-4 text-[12.5px] text-[hsl(var(--pro-ink-soft))]" />
        <section className="mx-2.5 mt-2.5 overflow-hidden rounded-[16px] bg-white">
          <h3 className="px-3.5 pt-3.5 text-[16px] font-semibold text-[hsl(var(--pro-ink))]">{es ? "Mi ruta semanal" : "My weekly route"}</h3>
          <WeeklyRoute />
        </section>
        <section ref={datesRef} className="mx-2.5 mt-2.5 scroll-mt-20 overflow-hidden rounded-[16px] bg-white">
          <h3 className="px-3.5 pt-3.5 text-[16px] font-semibold text-[hsl(var(--pro-ink))]">{es ? "Mi disponibilidad" : "My availability"}</h3>
          <MyDates />
        </section>
      </div>
      <InstallPrompt />
    </ProShell>
  );
}
