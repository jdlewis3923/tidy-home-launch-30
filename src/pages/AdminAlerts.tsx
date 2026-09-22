/**
 * /admin/alerts — the one list that says what needs doing today.
 *
 * Everything here is read straight from the database, so it stays truthful even
 * when the digest email fails. Grouped Critical / Action / Warning / Done today,
 * with Resolve, Snooze 1 day and the action link.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCircle2, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";
import type { TablesUpdate } from "@/integrations/supabase/types";

interface AlertRow {
  id: string;
  created_at: string;
  level: string | null;
  category: string | null;
  title: string | null;
  body: string | null;
  action_label: string | null;
  action_url: string | null;
  due_date: string | null;
  dedupe_key: string | null;
  resolved_at: string | null;
  snoozed_until: string | null;
}

const GROUPS = [
  { key: "critical", label: "Critical", tone: "border-rose-300 bg-rose-50" },
  { key: "action", label: "Action", tone: "border-amber-300 bg-amber-50" },
  { key: "warning", label: "Warning", tone: "border-slate-300 bg-slate-50" },
] as const;

export default function AdminAlerts() {
  const { hasRole: isAdmin, isLoading: roleLoading } = useHasRoleState("admin");
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_alerts")
      .select("id, created_at, level, category, title, body, action_label, action_url, due_date, dedupe_key, resolved_at, snoozed_until")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(`Could not load alerts: ${error.message}`);
    setRows((data ?? []) as unknown as AlertRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = Date.now();
  const open = useMemo(
    () => rows.filter((r) => !r.resolved_at && (!r.snoozed_until || new Date(r.snoozed_until).getTime() <= now)),
    [rows, now],
  );
  const snoozed = useMemo(
    () => rows.filter((r) => !r.resolved_at && r.snoozed_until && new Date(r.snoozed_until).getTime() > now),
    [rows, now],
  );
  const doneToday = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return rows.filter((r) => r.resolved_at && new Date(r.resolved_at).getTime() >= start.getTime());
  }, [rows]);

  const act = async (row: AlertRow, values: TablesUpdate<"admin_alerts">, message: string) => {
    setBusy(row.id);
    const { error } = await supabase.from("admin_alerts").update(values).eq("id", row.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(message);
    load();
  };

  if (roleLoading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const card = (row: AlertRow, tone: string) => (
    <article key={row.id} className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{row.title}</p>
          {row.body && <p className="mt-1 text-xs text-slate-700">{row.body}</p>}
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
            {row.category ?? "general"}
            {row.due_date ? ` · due ${row.due_date}` : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {row.action_url && (
          row.action_url.startsWith("http") ? (
            <a href={row.action_url} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="min-h-11">
                <ExternalLink className="mr-1 h-4 w-4" /> {row.action_label ?? "Open"}
              </Button>
            </a>
          ) : (
            <Link to={row.action_url}>
              <Button size="sm" variant="outline" className="min-h-11">
                {row.action_label ?? "Open"}
              </Button>
            </Link>
          )
        )}
        <Button
          size="sm" className="min-h-11" disabled={busy === row.id}
          onClick={() => act(row, { resolved_at: new Date().toISOString() }, "Resolved")}
        >
          <CheckCircle2 className="mr-1 h-4 w-4" /> Resolve
        </Button>
        <Button
          size="sm" variant="ghost" className="min-h-11" disabled={busy === row.id}
          onClick={() => act(row, { snoozed_until: new Date(Date.now() + 86_400_000).toISOString() }, "Snoozed a day")}
        >
          <Clock className="mr-1 h-4 w-4" /> Snooze 1 day
        </Button>
      </div>
    </article>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet><title>Alerts · Tidy Admin</title><meta name="robots" content="noindex" /></Helmet>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Bell className="h-5 w-5" /> Alerts
            </h1>
            <p className="text-xs text-slate-500">{open.length} open · {doneToday.length} done today</p>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="mr-1 h-4 w-4" /> {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
        {GROUPS.map((group) => {
          const items = open.filter((r) => (r.level ?? "warning") === group.key);
          return (
            <section key={group.key}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                {group.key === "critical" && <AlertTriangle className="h-4 w-4 text-rose-600" />}
                {group.label} ({items.length})
              </h2>
              {items.length === 0
                ? <p className="text-xs text-slate-500">Nothing here.</p>
                : <div className="space-y-2">{items.map((r) => card(r, group.tone))}</div>}
            </section>
          );
        })}

        {snoozed.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold text-slate-900">Snoozed ({snoozed.length})</h2>
            <ul className="space-y-1 text-xs text-slate-600">
              {snoozed.map((r) => (
                <li key={r.id}>{r.title} — back {new Date(r.snoozed_until!).toLocaleString()}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-900">Done today ({doneToday.length})</h2>
          {doneToday.length === 0
            ? <p className="text-xs text-slate-500">Nothing resolved yet today.</p>
            : <ul className="space-y-1 text-xs text-slate-600">
                {doneToday.map((r) => <li key={r.id}>{r.title}</li>)}
              </ul>}
        </section>
      </main>
    </div>
  );
}
