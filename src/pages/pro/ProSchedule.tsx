/**
 * Schedule (home) — /pro/schedule
 * Metric tiles, this week / next week, visits grouped by day.
 * COI blocking banner sits at the top: upcoming visits stay visible, starting
 * one does not (enforced server-side in pro-visit-action).
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import InstallPrompt from "@/components/pro/portal/InstallPrompt";
import {
  EmptyState, ErrorState, MetricTile, ScheduleSkeleton, VisitRow, WarningBanner, ProButton,
} from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { dayLabel, fetchNotifications, mondayOf, timeWindow } from "@/lib/pro-portal";
import { money } from "@/lib/pro-pay";

const COI_LABEL: Record<string, string> = {
  none: "Insurance",
  under_review: "Under review",
  active: "Active",
  expiring: "Expiring",
  expired: "Expired",
};

export default function ProSchedule() {
  const { me, coi, visits, loading, error, reload, userId } = useProSession();
  const [week, setWeek] = useState<"this" | "next">("this");
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
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }, [thisWeekStart.getTime()]);

  const nextVisitId = useMemo(() => {
    const upcoming = visits
      .filter((v) => v.scheduled_start && !v.completed_at && new Date(v.scheduled_start) >= new Date())
      .sort((a, b) => (a.scheduled_start! < b.scheduled_start! ? -1 : 1));
    return upcoming[0]?.id ?? null;
  }, [visits]);

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;

  const greeting = me?.first_name ? `Hi, ${me.first_name}` : "Your schedule";

  return (
    <ProShell title={greeting} showBell unread={unread}>
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

      {loading && <ScheduleSkeleton />}

      {!loading && error && <ErrorState title="Couldn't load your schedule" onRetry={reload} />}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 gap-3 p-4">
            <MetricTile label="Visits completed" value={String(me?.completed_visits ?? 0)} hint="All time" />
            <MetricTile label="Earned this week" value={money(earnedCents)} tone="green" hint={`${completedThisWeek.length} visits`} />
            <MetricTile label="Next payout" value={nextPayoutFriday} tone="gold" hint="Friday" />
            <MetricTile
              label="Insurance"
              value={COI_LABEL[coi?.status ?? "none"]}
              tone={coi?.status === "active" ? "green" : coi?.status === "expiring" || coi?.status === "under_review" ? "amber" : "red"}
            />
          </div>

          <div className="mx-4 mb-3 flex rounded-xl bg-white p-1 shadow-sm">
            {(["this", "next"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeek(w)}
                className={`min-h-[44px] flex-1 rounded-lg text-[14px] font-bold ${
                  week === w
                    ? "bg-[hsl(var(--pro-blue))] text-white"
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
            <div className="space-y-4 px-4">
              {grouped.map(([day, rows]) => (
                <section key={day}>
                  <h2 className="px-1 pb-2 text-[13px] font-extrabold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
                    {day}
                  </h2>
                  <div className="overflow-hidden rounded-2xl border border-[hsl(var(--pro-line))] bg-white">
                    {rows.map((v) => (
                      <VisitRow
                        key={v.id}
                        to={`/pro/visit/${v.id}`}
                        service={v.service_type}
                        street={v.street}
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
        </>
      )}

      <InstallPrompt />
    </ProShell>
  );
}
