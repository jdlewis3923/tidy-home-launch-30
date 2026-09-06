/**
 * One pay week — /pro/earnings/:weekId
 * Lists each completed visit in the week with its flat pay, plus bonuses.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ProShell from "@/components/pro/portal/ProShell";
import { ErrorState, ProCard, ScheduleSkeleton, StatusPill } from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { fetchBonuses, fetchPayoutWeeks, type PayoutWeek, type ProBonus } from "@/lib/pro-portal";
import { SERVICE_LABEL, money } from "@/lib/pro-pay";

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function ProPayoutWeek() {
  const { weekId } = useParams<{ weekId: string }>();
  const { visits, me, userId } = useProSession();
  const [week, setWeek] = useState<PayoutWeek | null>(null);
  const [bonuses, setBonuses] = useState<ProBonus[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState("loading");
    Promise.all([fetchPayoutWeeks(), me?.pro_id ? fetchBonuses(me.pro_id) : Promise.resolve([])])
      .then(([weeks, b]) => {
        if (cancelled) return;
        setWeek(weeks.find((w) => w.id === weekId) ?? null);
        setBonuses(b);
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [userId, me?.pro_id, weekId, nonce]);

  const weekVisits = useMemo(() => {
    if (!week) return [];
    const start = new Date(`${week.week_start}T00:00:00`);
    const end = new Date(`${week.week_end}T23:59:59`);
    return visits.filter((v) => v.completed_at && new Date(v.completed_at) >= start && new Date(v.completed_at) <= end);
  }, [visits, week]);

  const weekBonuses = useMemo(() => {
    if (!week) return [];
    const start = new Date(`${week.week_start}T00:00:00`);
    const end = new Date(`${week.week_end}T23:59:59`);
    return bonuses.filter((b) => b.earned_at && new Date(b.earned_at) >= start && new Date(b.earned_at) <= end);
  }, [bonuses, week]);

  return (
    <ProShell title="Pay week" back="/pro/earnings">
      {state === "loading" && <ScheduleSkeleton />}
      {state === "error" && <ErrorState title="Couldn't load this pay week" onRetry={() => setNonce((n) => n + 1)} />}
      {state === "ready" && !week && (
        <p className="p-6 text-[15px] text-[hsl(var(--pro-ink-soft))]">This pay week isn't available.</p>
      )}
      {state === "ready" && week && (
        <div className="space-y-4 p-4">
          <ProCard>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[18px] font-extrabold text-[hsl(var(--pro-ink))]">
                  {shortDate(week.week_start)} – {shortDate(week.week_end)}
                </p>
                <p className="text-[14px] text-[hsl(var(--pro-ink-soft))]">
                  Pays {shortDate(week.payout_date)}
                </p>
              </div>
              <StatusPill tone={week.status === "paid" ? "green" : week.status === "processing" ? "blue" : "neutral"}>
                {week.status}
              </StatusPill>
            </div>
            <p className="mt-4 text-[32px] font-extrabold leading-none text-[hsl(var(--pro-ink))]">
              {money(week.visit_pay_cents + week.bonus_cents)}
            </p>
            <p className="text-[13px] text-[hsl(var(--pro-ink-soft))]">
              {money(week.visit_pay_cents)} visit pay · {money(week.bonus_cents)} bonuses
            </p>
          </ProCard>

          <section>
            <h2 className="pb-2 text-[13px] font-extrabold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
              Completed visits
            </h2>
            <div className="overflow-hidden rounded-2xl border border-[hsl(var(--pro-line))]">
              {weekVisits.length === 0 && (
                <p className="bg-white px-4 py-4 text-[14px] text-[hsl(var(--pro-ink-soft))]">
                  No completed visits recorded in this week.
                </p>
              )}
              {weekVisits.map((v) => (
                <div
                  key={v.id}
                  className="flex min-h-[60px] items-center justify-between border-b border-[hsl(var(--pro-line))] bg-white px-4 last:border-0"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-[hsl(var(--pro-ink))]">
                      {SERVICE_LABEL[v.service_type ?? ""] ?? "Visit"}
                    </span>
                    <span className="text-[13px] text-[hsl(var(--pro-ink-soft))]">
                      {v.completed_at
                        ? new Date(v.completed_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                        : ""}{" "}
                      · {v.zip ?? ""}
                    </span>
                  </span>
                  <span className="text-[16px] font-extrabold text-[hsl(var(--pro-ink))]">
                    {money(v.visit_pay_cents)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {weekBonuses.length > 0 && (
            <section>
              <h2 className="pb-2 text-[13px] font-extrabold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
                Bonuses
              </h2>
              <div className="overflow-hidden rounded-2xl border border-[hsl(var(--pro-line))]">
                {weekBonuses.map((b) => (
                  <div
                    key={b.id}
                    className="flex min-h-[56px] items-center justify-between border-b border-[hsl(var(--pro-line))] bg-white px-4 last:border-0"
                  >
                    <span className="text-[15px] font-semibold text-[hsl(var(--pro-ink))]">
                      {b.reason ?? b.bonus_type ?? "Bonus"}
                    </span>
                    <span className="text-[16px] font-extrabold text-[hsl(var(--pro-green))]">
                      {money(b.amount_cents)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </ProShell>
  );
}
