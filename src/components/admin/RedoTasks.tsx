/** Open 48-hour-guarantee redos — top of Workday "Waiting on me", with a live clock. */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Redo = {
  id: string; visit_id: string; note: string | null; requested_at: string; due_at: string; status: string; is_test_row: boolean;
  user_id: string | null; applicant_id: string | null;
  visit?: { customer_first_name: string | null; service_type: string | null; visit_date: string | null; street: string | null } | null;
  pro?: { first_name: string | null; last_name: string | null } | null;
};

function hoursLeft(due: string, now: number) { return (new Date(due).getTime() - now) / 3_600_000; }
function fmt(h: number) {
  if (h <= 0) return `${Math.floor(-h)}h ${Math.floor((-h % 1) * 60)}m overdue`;
  return `${Math.floor(h)}h ${Math.floor((h % 1) * 60)}m left`;
}

export default function RedoTasks() {
  const [rows, setRows] = useState<Redo[]>([]);
  const [now, setNow] = useState(Date.now());
  const [when, setWhen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from("redo_requests").select("*").eq("status", "open").order("due_at");
    const list = (data ?? []) as Redo[];
    const vids = list.map((r) => r.visit_id); const aids = list.map((r) => r.applicant_id).filter(Boolean) as string[];
    const [{ data: vs }, { data: ps }] = await Promise.all([
      vids.length ? supabase.from("visits").select("id, customer_first_name, service_type, visit_date, street").in("id", vids) : Promise.resolve({ data: [] }),
      aids.length ? supabase.from("applicants").select("id, first_name, last_name").in("id", aids) : Promise.resolve({ data: [] }),
    ]);
    setRows(list.map((r) => ({ ...r, visit: (vs ?? []).find((v: { id: string }) => v.id === r.visit_id) ?? null, pro: (ps ?? []).find((p: { id: string }) => p.id === r.applicant_id) ?? null })));
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, [load]);

  const act = async (r: Redo, action: "schedule" | "cancel") => {
    if (action === "schedule" && !when[r.id]) { setMsg((m) => ({ ...m, [r.id]: "Pick a date and time first." })); return; }
    if (action === "cancel" && !confirm("Cancel this redo request?")) return;
    setBusy(r.id);
    const body = action === "schedule" ? { action, redo_id: r.id, scheduled_start: new Date(when[r.id]).toISOString() } : { action, redo_id: r.id };
    const { data, error } = await supabase.functions.invoke("redo-admin", { body });
    setBusy(null);
    if (error || !data?.ok) { setMsg((m) => ({ ...m, [r.id]: `Couldn't save (${data?.error ?? error?.message ?? "error"})` })); return; }
    void load();
  };

  if (rows.length === 0) return null;
  return (
    <div id="redos" className="px-5 pt-4" data-testid="redo-tasks">
      <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">Redo · waiting on me · {rows.length}</div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const h = hoursLeft(r.due_at, now);
          const red = h <= 12;
          return (
            <li key={r.id} className={`rounded-md border px-3 py-2.5 text-sm ${red ? "border-destructive bg-destructive/10" : "border-border bg-background"}`} data-testid="redo-task">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-foreground">
                  Redo · {r.visit?.customer_first_name ?? "Member"} · {r.pro ? `${r.pro.first_name} ${r.pro.last_name?.[0] ?? ""}.` : "no Pro"}
                  {r.is_test_row && <span className="ml-2 text-[10px] uppercase text-muted-foreground">test</span>}
                </span>
                <span className={`tabular-nums text-xs font-bold ${red ? "text-destructive" : "text-foreground"}`} data-testid="redo-clock">{fmt(h)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{r.visit?.service_type} · {r.visit?.visit_date} · {r.visit?.street}</p>
              <p className="mt-1 text-xs text-foreground">“{r.note || "No note left."}”</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input type="datetime-local" value={when[r.id] ?? ""} onChange={(e) => setWhen((w) => ({ ...w, [r.id]: e.target.value }))}
                  className="rounded border border-border bg-background px-2 py-1 text-xs" aria-label="Return visit time" />
                <button disabled={busy === r.id} onClick={() => act(r, "schedule")} className="rounded bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">Schedule free redo</button>
                <button disabled={busy === r.id} onClick={() => act(r, "cancel")} className="text-xs text-muted-foreground underline">Cancel</button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Free to the member · Pro paid 50% of the visit rate</p>
              {msg[r.id] && <p className="mt-1 text-[11px] text-destructive">{msg[r.id]}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
