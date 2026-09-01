/**
 * ReviewsThisWeekCard — admin dashboard summary of the Google-review → Pro
 * bonus pipeline. Read-only: counts this week's new reviews, average stars,
 * how many qualify for a bonus, how many are awaiting approval, plus an
 * 8-week volume sparkline. Admin-only RLS on public.reviews does the gating.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ReviewRow {
  stars: number | null;
  reviewer_name: string | null;
  posted_at: string;
  status: string | null;
}

const EXCLUDED_NAMES = ["a google user"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function ReviewsThisWeekCard() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 8 * WEEK_MS).toISOString();
      const { data } = await supabase
        .from("reviews")
        .select("stars, reviewer_name, posted_at, status")
        .gte("posted_at", since)
        .order("posted_at", { ascending: false });
      if (!cancelled) {
        setRows((data as ReviewRow[] | null) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const thisWeek = rows.filter((r) => now - new Date(r.posted_at).getTime() <= WEEK_MS);
    const starred = thisWeek.filter((r) => typeof r.stars === "number");
    const avg = starred.length
      ? starred.reduce((sum, r) => sum + (r.stars ?? 0), 0) / starred.length
      : null;
    const qualifying = thisWeek.filter(
      (r) =>
        r.stars === 5 &&
        !!r.reviewer_name &&
        !EXCLUDED_NAMES.includes(r.reviewer_name.trim().toLowerCase()),
    ).length;
    const awaiting = rows.filter((r) => r.status === "awaiting_approval").length;

    // 8-week volume buckets, oldest first.
    const buckets = Array.from({ length: 8 }, (_, i) => {
      const end = now - i * WEEK_MS;
      const start = end - WEEK_MS;
      return rows.filter((r) => {
        const t = new Date(r.posted_at).getTime();
        return t > start && t <= end;
      }).length;
    }).reverse();

    return { count: thisWeek.length, avg, qualifying, awaiting, buckets };
  }, [rows]);

  const peak = Math.max(1, ...stats.buckets);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
          <Star className="h-4 w-4 text-amber-500" aria-hidden="true" />
          Reviews this week
        </h2>
        <div className="flex items-center gap-2">
          {stats.awaiting > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              {stats.awaiting} awaiting approval
            </span>
          )}
          <Link to="/admin/reviews" className="text-xs font-semibold text-primary hover:underline">
            Open queue
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-slate-500">Loading…</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">New</dt>
              <dd className="text-lg font-bold tabular-nums text-slate-800">{stats.count}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Avg stars</dt>
              <dd className="text-lg font-bold tabular-nums text-slate-800">
                {stats.avg === null ? "—" : stats.avg.toFixed(1)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Qualifying</dt>
              <dd className="text-lg font-bold tabular-nums text-slate-800">{stats.qualifying}</dd>
            </div>
          </dl>

          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">8-week volume</p>
            <div className="mt-1 flex h-10 items-end gap-1" aria-hidden="true">
              {stats.buckets.map((n, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-primary/70"
                  style={{ height: `${Math.max(6, (n / peak) * 100)}%` }}
                  title={`${n} review${n === 1 ? "" : "s"}`}
                />
              ))}
            </div>
            <p className="sr-only">
              Weekly review counts, oldest first: {stats.buckets.join(", ")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
