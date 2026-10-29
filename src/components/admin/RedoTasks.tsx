/** Open 48-hour-guarantee redos — top of Workday "Waiting on me", with a live clock. */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from '@/contexts/LanguageContext';
import { REDO_PAY_EN, REDO_PAY_ES } from '@/lib/redo-pay';

type Redo = {
  id: string; visit_id: string; note: string | null; requested_at: string; due_at: string; status: string; is_test_row: boolean;
  user_id: string | null; applicant_id: string | null;
  visit?: { customer_first_name: string | null; service_type: string | null; visit_date: string | null; street: string | null; assigned_pro_id: string | null; cleaning_team_id: string | null; backup_pro_id: string | null } | null;
  pro?: { first_name: string | null; last_name: string | null } | null;
  teamPros?: { id: string; name: string }[];
};

function hoursLeft(due: string, now: number) { return (new Date(due).getTime() - now) / 3_600_000; }
function fmt(h: number) {
  if (h <= 0) return `${Math.floor(-h)}h ${Math.floor((-h % 1) * 60)}m overdue`;
  return `${Math.floor(h)}h ${Math.floor((h % 1) * 60)}m left`;
}

export default function RedoTasks() {
  const {language}=useLanguage();const es=language==='es';
  const [rows, setRows] = useState<Redo[]>([]);
  const [now, setNow] = useState(Date.now());
  const [when, setWhen] = useState<Record<string, string>>({});
  const [resp, setResp] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from("redo_requests").select("*").eq("status", "open").order("due_at");
    const list = (data ?? []) as Redo[];
    const vids = list.map((r) => r.visit_id); const aids = list.map((r) => r.applicant_id).filter(Boolean) as string[];
    const [{ data: vs }, { data: ps }] = await Promise.all([
      vids.length ? supabase.from("visits").select("id, customer_first_name, service_type, visit_date, street, assigned_pro_id, cleaning_team_id, backup_pro_id").in("id", vids) : Promise.resolve({ data: [] }),
      aids.length ? supabase.from("applicants").select("id, first_name, last_name").in("id", aids) : Promise.resolve({ data: [] }),
    ]);
    const visits = (vs ?? []) as (NonNullable<Redo["visit"]> & { id: string })[];
    const teamIds = [...new Set(visits.map((v) => v.cleaning_team_id).filter(Boolean))] as string[];
    const { data: teams } = teamIds.length
      ? await supabase.from("cleaning_teams").select("id, lead_pro_id, partner_pro_id").in("id", teamIds)
      : { data: [] as { id: string; lead_pro_id: string | null; partner_pro_id: string | null }[] };
    // Every contractor who worked each visit (lead, partner, backup) by name.
    const contractorIds = new Set<string>();
    for (const v of visits) {
      if (v.assigned_pro_id) contractorIds.add(v.assigned_pro_id);
      if (v.backup_pro_id) contractorIds.add(v.backup_pro_id);
      const t = (teams ?? []).find((x) => x.id === v.cleaning_team_id);
      if (t?.lead_pro_id) contractorIds.add(t.lead_pro_id);
      if (t?.partner_pro_id) contractorIds.add(t.partner_pro_id);
    }
    const { data: names } = contractorIds.size
      ? await supabase.from("applicants").select("contractor_id, first_name, last_name").in("contractor_id", [...contractorIds])
      : { data: [] as { contractor_id: string; first_name: string | null; last_name: string | null }[] };
    const nameOf = (cid: string | null) => {
      const n = (names ?? []).find((x) => x.contractor_id === cid);
      return n ? `${n.first_name ?? ""} ${n.last_name?.[0] ?? ""}.`.trim() : null;
    };
    setRows(list.map((r) => {
      const v = visits.find((x) => x.id === r.visit_id) ?? null;
      const t = (teams ?? []).find((x) => x.id === v?.cleaning_team_id);
      const ids = [...new Set([v?.assigned_pro_id, t?.lead_pro_id, v?.backup_pro_id ?? t?.partner_pro_id].filter(Boolean))] as string[];
      const teamPros = ids.length > 1 ? ids.map((id) => ({ id, name: nameOf(id) ?? "Pro" })) : undefined;
      return { ...r, visit: v, pro: (ps ?? []).find((p: { id: string }) => p.id === r.applicant_id) ?? null, teamPros };
    }));
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, [load]);

  const act = async (r: Redo, action: "schedule" | "cancel") => {
    if (action === "schedule" && !when[r.id]) { setMsg((m) => ({ ...m, [r.id]: "Pick a date and time first." })); return; }
    if (action === "cancel" && !confirm("Cancel this redo request?")) return;
    setBusy(r.id);
    const body = action === "schedule"
      ? { action, redo_id: r.id, scheduled_start: new Date(when[r.id]).toISOString(), ...(resp[r.id] ? { responsible_pro_id: resp[r.id] } : {}) }
      : { action, redo_id: r.id };
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
                {r.teamPros && (
                  <select value={resp[r.id] ?? ""} onChange={(e) => setResp((s) => ({ ...s, [r.id]: e.target.value }))}
                    className="rounded border border-border bg-background px-2 py-1 text-xs" aria-label="Whose zone was missed">
                    <option value="">Whose zone? (default: original Pro)</option>
                    {r.teamPros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                <button disabled={busy === r.id} onClick={() => act(r, "schedule")} className="rounded bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">Schedule free redo</button>
                <button disabled={busy === r.id} onClick={() => act(r, "cancel")} className="text-xs text-muted-foreground underline">Cancel</button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{es?REDO_PAY_ES:REDO_PAY_EN}</p>
              {msg[r.id] && <p className="mt-1 text-[11px] text-destructive">{msg[r.id]}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
