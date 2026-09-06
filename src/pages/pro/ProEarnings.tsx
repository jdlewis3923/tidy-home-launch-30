/**
 * Earnings — /pro/earnings
 * Weekly pay ledger. Every figure is the flat per-visit amount, never an
 * hourly rate and never a projection.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ChevronRight, Download, Wallet } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import {
  EmptyState, ErrorState, Eyebrow, HeroPanel, MetricTile, ProCard, ScheduleSkeleton, SectionHeader, StatusPill,
} from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { downloadCsv, fetchBonuses, fetchPayoutWeeks, mondayOf, type PayoutWeek, type ProBonus } from "@/lib/pro-portal";
import { money } from "@/lib/pro-pay";

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function ProEarnings() {
  const { me, visits, userId, loading } = useProSession();
  const [weeks, setWeeks] = useState<PayoutWeek[] | null>(null);
  const [bonuses, setBonuses] = useState<ProBonus[]>([]);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setError(false);
    Promise.all([fetchPayoutWeeks(), me?.pro_id ? fetchBonuses(me.pro_id) : Promise.resolve([])])
      .then(([w, b]) => {
        if (cancelled) return;
        setWeeks(w);
        setBonuses(b);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [userId, me?.pro_id, nonce]);

  const thisWeekStart = mondayOf(new Date());
  const thisWeek = visits.filter((v) => v.completed_at && new Date(v.completed_at) >= thisWeekStart);
  const thisWeekCents = thisWeek.reduce((s, v) => s + (v.visit_pay_cents ?? 0), 0);
  const lifetimeCents = visits
    .filter((v) => v.completed_at)
    .reduce((s, v) => s + (v.visit_pay_cents ?? 0), 0);
  const pendingBonusCents = bonuses
    .filter((b) => b.status !== "paid")
    .reduce((s, b) => s + (b.amount_cents ?? 0), 0);

  const nextFriday = useMemo(() => {
    const d = new Date(thisWeekStart);
    d.setDate(d.getDate() + 11);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }, [thisWeekStart.getTime()]);

  const exportCsv = () => {
    downloadCsv("tidy-earnings.csv", [
      ["Week start", "Week end", "Payout date", "Status", "Visit pay", "Bonuses"],
      ...(weeks ?? []).map((w) => [
        w.week_start,
        w.week_end,
        w.payout_date,
        w.status,
        (w.visit_pay_cents / 100).toFixed(2),
        (w.bonus_cents / 100).toFixed(2),
      ]),
    ]);
  };

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;

  return (
    <ProShell title="Earnings">
      <section className="px-[18px] pt-4">
        <HeroPanel className="pro-rise">
          <Eyebrow className="text-[hsl(var(--pro-sky))]">Earned this week</Eyebrow>
          <p className="pro-num pro-display mt-2 text-[34px] font-extrabold">{money(thisWeekCents)}</p>
          <p className="mt-1 text-[14px] text-white/70">
            {thisWeek.length} {thisWeek.length === 1 ? "visit" : "visits"} completed · pays {nextFriday}
          </p>
        </HeroPanel>
      </section>

      <div className="grid grid-cols-2 gap-3 px-[18px] pt-4">
        <MetricTile label="Lifetime pay" value={money(lifetimeCents)} />
        <MetricTile
          label="Bonuses pending"
          value={money(pendingBonusCents)}
          tone={pendingBonusCents > 0 ? "amber" : "tint"}
        />
      </div>

      {!weeks && !error && <ScheduleSkeleton />}
      {error && <ErrorState title="Couldn't load your earnings" onRetry={() => setNonce((n) => n + 1)} />}

      {weeks && !error && (
        <div className="px-[18px] pt-6">
          <SectionHeader
            title="Weekly pay"
            action={
              weeks.length > 0 ? (
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-bold text-[hsl(var(--pro-blue))]"
                >
                  <Download className="h-4 w-4" aria-hidden strokeWidth={1.9} /> Export
                </button>
              ) : undefined
            }
          />

          {weeks.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No pay weeks yet"
              body="Your first week appears here after your first completed visit."
            />
          ) : (
            <div className="overflow-hidden rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)] bg-white pro-card">
              {weeks.map((w) => (
                <Link
                  key={w.id}
                  to={`/pro/earnings/${w.id}`}
                  className="flex min-h-[66px] items-center gap-3 border-b border-[hsl(var(--pro-navy)/0.07)] bg-white px-4 last:border-0 active:bg-[hsl(var(--pro-tint))]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-[hsl(var(--pro-ink))]">
                      {shortDate(w.week_start)} – {shortDate(w.week_end)}
                    </span>
                    <span className="text-[13px] text-[hsl(var(--pro-ink-soft))]">
                      Pays {shortDate(w.payout_date)}
                    </span>
                  </span>
                  <StatusPill tone={w.status === "paid" ? "green" : w.status === "processing" ? "blue" : "neutral"}>
                    {w.status}
                  </StatusPill>
                  <span className="pro-num text-[17px] font-extrabold text-[hsl(var(--pro-ink))]">
                    {money(w.visit_pay_cents + w.bonus_cents)}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[hsl(var(--pro-ink-soft))]" aria-hidden />
                </Link>
              ))}
            </div>
          )}

          <ProCard className="my-5" tone="tint">
            <p className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">How pay works</p>
            <p className="mt-1 text-[14px] text-[hsl(var(--pro-ink-soft))]">
              You're paid a flat amount for each completed visit. Weeks run Monday to Sunday and pay
              out the following Friday.
            </p>
          </ProCard>
        </div>
      )}
    </ProShell>
  );
}
