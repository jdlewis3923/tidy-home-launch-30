/**
 * Pro tracker — /admin/pro-tracker
 * Live view of today's visits: where each Pro is relative to the job, when
 * they arrived, how long they've been on site, and when they finished.
 * Data comes from admin_pro_tracker (server-side, admin-only): visit times,
 * GPS distance at check-in, and the latest live location ping. Refreshes
 * every 60 s; elapsed timers tick every 30 s.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type TrackerRow = {
  id: string;
  status: string | null;
  service_type: string | null;
  visit_kind: string | null;
  size_tier: number | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  customer_first_name: string | null;
  street: string | null;
  zip: string | null;
  pro_first_name: string | null;
  on_my_way_at: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  completed_at: string | null;
  check_in_distance_m: number | null;
  last_ping: { distance_m: number | null; at: string } | null;
  is_late: boolean;
};

const SERVICE_LABEL: Record<string, string> = {
  cleaning: "Cleaning",
  lawn: "Lawn",
  detailing: "Car Care",
};

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function elapsed(from: string, to?: string | null) {
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime();
  if (ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function pingAge(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function statusLine(row: TrackerRow): { label: string; tone: string } {
  if (row.completed_at || row.status === "complete") {
    const dur = row.check_in_at ? elapsed(row.check_in_at, row.check_out_at ?? row.completed_at) : null;
    return { label: `Done${dur ? ` · on site ${dur}` : ""}`, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  }
  if (row.check_in_at || row.status === "in_progress") {
    const since = row.check_in_at ? elapsed(row.check_in_at) : null;
    return { label: `On site${since ? ` · ${since}` : ""}`, tone: "text-blue-700 bg-blue-50 border-blue-200" };
  }
  if (row.on_my_way_at || row.status === "on_the_way") {
    return { label: `On the way · left ${fmtTime(row.on_my_way_at)}`, tone: "text-amber-700 bg-amber-50 border-amber-200" };
  }
  if (row.is_late) {
    return { label: "Late — not checked in", tone: "text-red-700 bg-red-50 border-red-200" };
  }
  return { label: "Scheduled", tone: "text-muted-foreground bg-muted border-border" };
}

export default function AdminProTracker() {
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const load = async () => {
    const { data, error: rpcErr } = await supabase.rpc("admin_pro_tracker");
    if (rpcErr) setError(rpcErr.message);
    else setRows((data as unknown as TrackerRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), 60000);
    const tick = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => { window.clearInterval(refresh); window.clearInterval(tick); };
  }, []);

  const today = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" }),
    [],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Pro tracker</h1>
          <p className="text-sm text-muted-foreground">{today} · refreshes every minute</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-4 w-4" /> Refresh
        </Button>
      </div>

      {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No visits scheduled today.</p>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const s = statusLine(row);
          return (
            <section key={row.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-foreground">
                    {row.pro_first_name ?? "Unassigned"} → {row.customer_first_name ?? "Member"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {SERVICE_LABEL[row.service_type ?? ""] ?? row.service_type ?? "Visit"}
                    {row.size_tier ? ` · ${row.size_tier === 5 ? "Estate Plus" : row.size_tier === 4 ? "Estate" : `Size ${row.size_tier}`}` : ""}
                    {" · "}{fmtTime(row.scheduled_start)}–{fmtTime(row.scheduled_end)}
                  </p>
                  <p className="text-sm text-muted-foreground">{row.street ?? ""}{row.zip ? `, ${row.zip}` : ""}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${s.tone}`}>{s.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arrived</p>
                  <p className="text-foreground">{fmtTime(row.check_in_at)}</p>
                  {row.check_in_distance_m !== null && (
                    <p className="text-xs text-muted-foreground">{row.check_in_distance_m} m from address</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">On site</p>
                  <p className="text-foreground">
                    {row.check_in_at ? elapsed(row.check_in_at, row.check_out_at ?? row.completed_at) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Finished</p>
                  <p className="text-foreground">{fmtTime(row.check_out_at ?? row.completed_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live location</p>
                  {row.last_ping ? (
                    <p className="flex items-center gap-1 text-foreground">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      {row.last_ping.distance_m !== null ? `${row.last_ping.distance_m} m away` : "pinged"}
                      <span className="text-xs text-muted-foreground">· {pingAge(row.last_ping.at)}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
