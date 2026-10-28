/**
 * Earnings — /pro/earnings (mockup screen 4).
 * Flat per-visit pay only; never hourly, never projected.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, ChevronRight, Circle, Download } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import { proPartnerCountLine, useProPartner } from "@/components/pro/ProPartnerStrip";
import { ErrorState, ScheduleSkeleton, StatusPill } from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { downloadCsv, fetchBonuses, fetchPayoutWeeks, mondayOf, type PayoutWeek, type ProBonus } from "@/lib/pro-portal";
import { money, TIER_2_GATES } from "@/lib/pro-pay";
import { useLanguage } from "@/contexts/LanguageContext";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
type Range = "week" | "month" | "all";

export function Bar({ pct, tone = "--pro-blue" }: { pct: number; tone?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="h-[9px] overflow-hidden rounded-full bg-[hsl(var(--pro-line))]">
      <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, hsl(var(${tone})), hsl(var(--pro-sky)))`, boxShadow: `0 0 8px hsl(var(${tone}) / 0.45)` }}
        initial={{ width: reduce ? `${pct}%` : 0 }} animate={{ width: `${pct}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: EASE, delay: 0.15 }} />
    </div>
  );
}

export default function ProEarnings() {
  const partner = useProPartner();
  const { me, visits, userId, loading } = useProSession();
  const { language } = useLanguage();
  const es = language === "es";
  const loc = es ? "es-US" : "en-US";
  const reduce = useReducedMotion();
  const [range, setRange] = useState<Range>("week");
  const [weeks, setWeeks] = useState<PayoutWeek[] | null>(null);
  const [bonuses, setBonuses] = useState<ProBonus[]>([]);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setError(false);
    Promise.all([fetchPayoutWeeks(), me?.pro_id ? fetchBonuses(me.pro_id) : Promise.resolve([])])
      .then(([w, b]) => { if (!cancelled) { setWeeks(w); setBonuses(b); } })
      .catch(() => !cancelled && setError(true));
    return () => { cancelled = true; };
  }, [userId, me?.pro_id, nonce]);

  const weekStart = mondayOf(new Date());
  const now = new Date();
  const from = range === "week" ? weekStart : range === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(0);
  const done = visits.filter((v) => v.completed_at && new Date(v.completed_at) >= from);
  const rangeCents = done.reduce((s, v) => s + (v.visit_pay_cents ?? 0), 0);
  const lifetimeCents = visits.filter((v) => v.completed_at).reduce((s, v) => s + (v.visit_pay_cents ?? 0), 0);
  const pendingBonusCents = bonuses.filter((b) => b.status !== "paid").reduce((s, b) => s + (b.amount_cents ?? 0), 0);
  const payDay = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 11); return d.toLocaleDateString(loc, { month: "short", day: "numeric" }); }, [weekStart.getTime(), loc]);

  const visitsDone = me?.completed_visits ?? 0;
  const rating = me?.avg_rating ?? 0;
  const days = me?.active_since ? Math.max(0, Math.floor((Date.now() - new Date(me.active_since).getTime()) / 86_400_000)) : 0;
  const left = Math.max(0, TIER_2_GATES.visits - visitsDone);

  const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(loc, { month: "short", day: "numeric" });
  const exportCsv = () => downloadCsv("tidy-earnings.csv", [
    ["Week start", "Week end", "Payout date", "Status", "Visit pay", "Bonuses"],
    ...(weeks ?? []).map((w) => [w.week_start, w.week_end, w.payout_date, w.status, (w.visit_pay_cents / 100).toFixed(2), (w.bonus_cents / 100).toFixed(2)]),
  ]);

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;
  const up = (i: number) => reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.26, delay: 0.06 * i, ease: EASE } };
  const partnerLine = proPartnerCountLine(partner);
  const rangeLabel = range === "week" ? (es ? "Ganado esta semana" : "Earned This Week") : range === "month" ? (es ? "Ganado este mes" : "Earned This Month") : (es ? "Ganado en total" : "Earned All Time");

  return (
    <ProShell title={es ? "Pagos" : "Earnings"} showBell dark>
      <div className="space-y-2.5 px-2.5 pt-2">
        <div className="flex rounded-[12px] bg-[hsl(var(--pro-deep-2))] p-1" role="tablist">
          {([["week", es ? "Esta semana" : "This Week"], ["month", es ? "Este mes" : "This Month"], ["all", es ? "Todo" : "All Time"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={range === k} type="button" onClick={() => setRange(k)}
              className={`relative min-h-[38px] flex-1 rounded-[10px] text-[13px] font-medium transition-colors duration-200 ${range === k ? "text-[hsl(var(--pro-ink))]" : "text-primary-foreground/85"}`}>
              {range === k && <motion.span layoutId="earn-tab" transition={{ duration: reduce ? 0 : 0.22, ease: EASE }} className="absolute inset-0 rounded-[10px] bg-white shadow-[0_4px_10px_-6px_hsl(var(--pro-navy)/0.6)]" />}
              <span className="relative">{l}</span></button>
          ))}
        </div>

        <motion.div {...up(0)} className="flex items-center rounded-[16px] border-[1.5px] border-[hsl(var(--pro-sky)/0.8)] bg-[radial-gradient(120%_140%_at_0%_0%,hsl(var(--pro-blue)/0.35),hsl(var(--pro-deep-2))_60%)] p-4 text-primary-foreground shadow-[0_0_22px_-6px_hsl(var(--pro-sky)/0.55)]">
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-[hsl(var(--pro-sky))]">{rangeLabel}</p>
            <p className="mt-1.5 text-[36px] font-bold leading-none">{money(rangeCents)}</p>
            <p className="mt-2 text-[12px] text-primary-foreground/75">{done.length} {es ? (done.length === 1 ? "visita completada" : "visitas completadas") : (done.length === 1 ? "visit completed" : "visits completed")} · {es ? "paga" : "pays"} {payDay}</p>
          </div>
          <ChevronRight className="h-6 w-6 text-[hsl(var(--pro-sky))]" aria-hidden />
        </motion.div>

        <div className="grid grid-cols-2 gap-2.5">
          {[[es ? "Pago total" : "Lifetime Pay", lifetimeCents], [es ? "Bonos pendientes" : "Bonuses Pending", pendingBonusCents]].map(([l, c], i) => (
            <motion.div key={String(l)} {...up(i + 1)} className="rounded-[16px] bg-white p-4 shadow-[0_6px_16px_-10px_hsl(var(--pro-navy)/0.5)]">
              <p className="text-[12px] text-[hsl(var(--pro-ink-soft))]">{l}</p>
              <p className="mt-1.5 text-[26px] font-bold text-[hsl(var(--pro-ink))]">{money(c as number)}</p>
            </motion.div>
          ))}
        </div>

        <motion.section {...up(3)} className="rounded-[14px] bg-white p-3.5">
          <h2 className="text-[18px] font-bold text-[hsl(var(--pro-ink))]">{es ? "Progreso de pago" : "Pay Progress"}</h2>
          <div className="mt-2.5 space-y-2">
            <div className="rounded-[10px] border border-[hsl(var(--pro-line))] p-3">
              <div className="mb-2.5 flex justify-between text-[13.5px] font-semibold text-[hsl(var(--pro-ink))]">
                <span>{es ? `${left} visitas para su aumento del 10%` : `${left} visits to your 10% raise`}</span>
                <span>{visitsDone} / {TIER_2_GATES.visits}</span>
              </div>
              <Bar pct={Math.min(100, (visitsDone / TIER_2_GATES.visits) * 100)} />
            </div>
            {[
              [days >= TIER_2_GATES.days, `${Math.min(days, TIER_2_GATES.days)} / ${TIER_2_GATES.days} ${es ? "días activo" : "days active"}`, ""],
              [rating >= TIER_2_GATES.rating, es ? "Calificación promedio" : "Average rating", `${rating ? rating.toFixed(1) : "—"} / ${TIER_2_GATES.rating}`],
            ].map(([ok, l, r]) => (
              <div key={String(l)} className="flex items-center gap-2.5 rounded-[10px] border border-[hsl(var(--pro-line))] px-3 py-3 text-[13.5px] text-[hsl(var(--pro-ink))]">
                {ok ? <motion.span initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25, delay: 0.35 }}><CheckCircle2 className="h-6 w-6 text-primary-foreground" fill="hsl(var(--pro-green))" aria-hidden /></motion.span> : <Circle className="h-6 w-6 text-[hsl(var(--pro-ink-soft)/0.6)]" aria-hidden />}
                <span className="flex-1">{l}</span><span>{r}</span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[11.5px] text-[hsl(var(--pro-ink-soft))]">{es ? "Cuando cumpla las tres, el aumento se aplica automáticamente desde su próxima visita." : "When all three are met, the raise applies automatically from your next visit."}</p>
        </motion.section>

        {partnerLine && <p className="px-1 text-[13px] text-primary-foreground/80" data-testid="pro-partner-count">{partnerLine}</p>}
        {!weeks && !error && <ScheduleSkeleton />}
        {error && <ErrorState title={es ? "No se pudieron cargar sus pagos" : "Couldn't load your earnings"} onRetry={() => setNonce((n) => n + 1)} />}
        {weeks && !error && (
          <section className="overflow-hidden rounded-[14px] bg-white">
            <div className="flex items-center justify-between px-3.5 pt-3">
              <h2 className="text-[15px] font-semibold text-[hsl(var(--pro-ink))]">{es ? "Pago semanal" : "Weekly pay"}</h2>
              {weeks.length > 0 && <button type="button" onClick={exportCsv} className="inline-flex min-h-[40px] items-center gap-1.5 text-[13px] font-medium text-[hsl(var(--pro-blue))]"><Download className="h-4 w-4" aria-hidden />{es ? "Exportar" : "Export"}</button>}
            </div>
            {weeks.length === 0 ? <p className="px-3.5 py-3 text-[13px] text-[hsl(var(--pro-ink-soft))]">{es ? "Su primera semana aparece después de su primera visita completada." : "Your first week appears here after your first completed visit."}</p> : weeks.map((w) => (
              <Link key={w.id} to={`/pro/earnings/${w.id}`} className="flex min-h-[60px] items-center gap-3 border-t border-[hsl(var(--pro-line))] px-3.5">
                <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-[hsl(var(--pro-ink))]">{shortDate(w.week_start)} – {shortDate(w.week_end)}</span><span className="text-[12px] text-[hsl(var(--pro-ink-soft))]">{es ? "Paga" : "Pays"} {shortDate(w.payout_date)}</span></span>
                <StatusPill tone={w.status === "paid" ? "green" : w.status === "processing" ? "blue" : "neutral"}>{w.status}</StatusPill>
                <span className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">{money(w.visit_pay_cents + w.bonus_cents)}</span>
                <ChevronRight className="h-4 w-4 text-[hsl(var(--pro-ink-soft))]" aria-hidden />
              </Link>
            ))}
            <p className="border-t border-[hsl(var(--pro-line))] px-3.5 py-3 text-[12px] text-[hsl(var(--pro-ink-soft))]">{es ? "Se le paga un monto fijo por cada visita completada. Las semanas van de lunes a domingo y se pagan el viernes siguiente." : "You're paid a flat amount for each completed visit. Weeks run Monday to Sunday and pay out the following Friday."}</p>
          </section>
        )}
      </div>
    </ProShell>
  );
}
