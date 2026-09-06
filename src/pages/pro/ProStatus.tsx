/**
 * Status — /pro/status
 * Standing, badge and the three Tier 2 gates. Progress is shown as recorded,
 * never rounded up or projected.
 */
import { Navigate } from "react-router-dom";
import { BadgeCheck, ShieldCheck, Star } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import {
  CopyLink, ErrorState, MetricTile, ProCard, ProgressRow, ScheduleSkeleton, StatusPill,
} from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { TIER_2_GATES } from "@/lib/pro-pay";

const daysActive = (since: string | null) =>
  since ? Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000)) : 0;

export default function ProStatus() {
  const { me, coi, loading, error, reload, userId } = useProSession();
  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;

  const tier2 = me?.tier === "tier_2_pro" || me?.tier === "tier_2";
  const visitsDone = me?.completed_visits ?? 0;
  const rating = me?.avg_rating ?? 0;
  const days = daysActive(me?.active_since ?? null);

  return (
    <ProShell title="Status">
      {loading && <ScheduleSkeleton />}
      {!loading && error && <ErrorState title="Couldn't load your status" onRetry={reload} />}
      {!loading && !error && (
        <div className="space-y-4 p-4">
          <ProCard tone={tier2 ? "green" : "blue"}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
                  Your tier
                </p>
                <p className="text-[22px] font-extrabold text-[hsl(var(--pro-ink))]">
                  {tier2 ? "Tier 2 Pro" : "Tier 1 Verified"}
                </p>
              </div>
              <BadgeCheck className="h-9 w-9 text-[hsl(var(--pro-blue))]" aria-hidden />
            </div>
            {tier2 ? (
              <p className="mt-2 text-[14px] text-[hsl(var(--pro-ink-soft))]">
                Tier 2 pay applies to your completed visits.
              </p>
            ) : (
              <p className="mt-2 text-[14px] text-[hsl(var(--pro-ink-soft))]">
                Tier 2 unlocks at {TIER_2_GATES.visits} completed visits, a {TIER_2_GATES.rating} rating
                and {TIER_2_GATES.days} days active.
              </p>
            )}
          </ProCard>

          <div className="grid grid-cols-2 gap-3">
            <MetricTile label="Visits completed" value={String(visitsDone)} />
            <MetricTile
              label="Customer rating"
              value={rating ? rating.toFixed(2) : "—"}
              tone={rating >= TIER_2_GATES.rating ? "green" : "neutral"}
              hint={rating ? undefined : "No ratings yet"}
            />
          </div>

          {!tier2 && (
            <ProCard>
              <p className="text-[13px] font-extrabold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
                Path to Tier 2
              </p>
              <ProgressRow
                label="Completed visits"
                current={visitsDone}
                target={TIER_2_GATES.visits}
                display={`${visitsDone} / ${TIER_2_GATES.visits}`}
              />
              <ProgressRow
                label="Customer rating"
                current={rating}
                target={TIER_2_GATES.rating}
                display={rating ? `${rating.toFixed(2)} / ${TIER_2_GATES.rating}` : `— / ${TIER_2_GATES.rating}`}
              />
              <ProgressRow
                label="Days active"
                current={days}
                target={TIER_2_GATES.days}
                display={`${days} / ${TIER_2_GATES.days}`}
              />
            </ProCard>
          )}

          <ProCard>
            <div className="flex items-center justify-between">
              <p className="inline-flex items-center gap-2 text-[15px] font-bold text-[hsl(var(--pro-ink))]">
                <ShieldCheck className="h-5 w-5 text-[hsl(var(--pro-blue))]" aria-hidden /> Badge
              </p>
              <StatusPill tone={me?.badge_status === "active" ? "green" : me?.badge_status === "suspended" ? "amber" : "red"}>
                {me?.badge_status ?? "not issued"}
              </StatusPill>
            </div>
            {me?.pro_number && (
              <p className="mt-2 text-[14px] text-[hsl(var(--pro-ink-soft))]">Pro number {me.pro_number}</p>
            )}
            {me?.badge_token && (
              <div className="mt-3">
                <p className="pb-1 text-[13px] text-[hsl(var(--pro-ink-soft))]">
                  Your verification link — customers can check your badge with this.
                </p>
                <CopyLink value={`${window.location.origin}/verify/${me.badge_token}`} label="Copy" />
              </div>
            )}
          </ProCard>

          <ProCard tone={coi?.can_work ? "green" : "amber"}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">Insurance</p>
              <StatusPill tone={coi?.can_work ? "green" : "amber"}>{coi?.status ?? "none"}</StatusPill>
            </div>
            <p className="mt-1 text-[14px] text-[hsl(var(--pro-ink-soft))]">
              {coi?.expires_at
                ? `Certificate on file expires ${new Date(coi.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
                : "No certificate on file yet."}
            </p>
          </ProCard>

          {me?.referral_code && (
            <ProCard>
              <p className="inline-flex items-center gap-2 text-[15px] font-bold text-[hsl(var(--pro-ink))]">
                <Star className="h-5 w-5 text-[hsl(var(--pro-gold))]" aria-hidden /> Refer a Pro
              </p>
              <p className="mt-1 text-[14px] text-[hsl(var(--pro-ink-soft))]">
                Share your code with someone who'd be a good fit.
              </p>
              <div className="mt-3">
                <CopyLink value={me.referral_code} label="Copy code" />
              </div>
            </ProCard>
          )}
        </div>
      )}
    </ProShell>
  );
}
