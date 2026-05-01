/**
 * /admin/nextdoor-verify — Nextdoor launch schedule verification.
 *
 * Lists the 12 nextdoor rows from public.social_launch_posts with
 * post_number, status, scheduled_for, and an explicit "image attached?"
 * check (image_url IS NOT NULL). Read-only.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";

type Row = {
  id: string;
  post_number: number;
  status: string;
  scheduled_for: string | null;
  image_url: string | null;
  title: string | null;
};

const ET_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default function AdminNextdoorVerify() {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (roleLoading || !hasRole) return;
    (async () => {
      const { data, error } = await supabase
        .from("social_launch_posts")
        .select("id, post_number, status, scheduled_for, image_url, title")
        .eq("channel", "nextdoor")
        .order("post_number", { ascending: true });
      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
    })();
  }, [roleLoading, hasRole]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const total = rows.length;
    const scheduled = rows.filter((r) => r.status === "scheduled").length;
    const withImage = rows.filter((r) => !!r.image_url).length;
    const withSchedule = rows.filter((r) => !!r.scheduled_for).length;
    return { total, scheduled, withImage, withSchedule };
  }, [rows]);

  if (roleLoading) return <div className="p-8 text-sm text-slate-600">Loading…</div>;
  if (!hasRole) return <div className="p-8 text-sm text-rose-700">Admins only.</div>;

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-black text-slate-900">Nextdoor launch verification</h1>
        <p className="mt-2 text-sm text-slate-600">
          12 posts in <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">social_launch_posts</code>{" "}
          where <code>channel = 'nextdoor'</code>. Times shown in America/New_York.
        </p>

        {summary && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total rows" value={`${summary.total} / 12`} ok={summary.total === 12} />
            <Stat label="Status: scheduled" value={`${summary.scheduled} / 12`} ok={summary.scheduled === 12} />
            <Stat label="Has scheduled_for" value={`${summary.withSchedule} / 12`} ok={summary.withSchedule === 12} />
            <Stat label="Has image_url" value={`${summary.withImage} / 12`} ok={summary.withImage === 12} />
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Scheduled (ET)</th>
                <th className="px-4 py-3 text-left">Scheduled (UTC)</th>
                <th className="px-4 py-3 text-left">Image</th>
                <th className="px-4 py-3 text-left">Title</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!rows ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No nextdoor rows found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const hasImage = !!r.image_url;
                  const statusOk = r.status === "scheduled";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">{r.post_number}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            statusOk
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {r.scheduled_for ? ET_FMT.format(new Date(r.scheduled_for)) : <span className="text-rose-700">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {r.scheduled_for ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {hasImage ? (
                          <a
                            href={r.image_url!}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
                          >
                            ✓ attached
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                            ✗ missing
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.title ?? <span className="text-slate-400">—</span>}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className={`mt-1 text-xl font-black ${ok ? "text-emerald-800" : "text-amber-800"}`}>{value}</p>
    </div>
  );
}
