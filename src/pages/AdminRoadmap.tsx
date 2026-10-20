/**
 * /admin/roadmap — growth initiatives, feature switches, checklists, build prompts.
 * Switches only turn customer-facing pieces on; they default OFF.
 */
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { toast } from "@/hooks/use-toast";
import { dueDate, pctDone, daysBetween, fmt, type Initiative } from "../../supabase/functions/_shared/roadmap-rules";

type Row = Initiative & { slug: string; switch_key: string; gate_note: string | null; summary: string | null; extra_dates: string[];
  items: (Initiative["items"][number] & { note: string | null; sort: number })[] };
const STATUSES = ["planned", "building", "ready", "live", "paused"] as const;
const OWNERS = ["Justin", "Lovable", "Chrome", "Pro"] as const;
const STATUS_CLS: Record<string, string> = {
  planned: "bg-muted", building: "bg-primary/60", ready: "bg-accent", live: "bg-primary", paused: "bg-destructive/60",
};
const T0 = "2026-11-01", T1 = "2028-10-31";

export default function AdminRoadmap() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["roadmap"], enabled: !!hasRole,
    queryFn: async () => {
      const { data, error } = await supabase.from("roadmap_initiatives").select("*, items:roadmap_items(*)").order("sort");
      if (error) throw error;
      return (data as unknown as Row[]).map((r) => ({ ...r, items: [...r.items].sort((a, b) => b.lead_days - a.lead_days || a.sort - b.sort) }));
    },
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["roadmap"] });
  const upd = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("roadmap_initiatives").update(patch as never).eq("id", id);
    if (error) toast({ title: "Not saved", description: error.message, variant: "destructive" }); else refresh();
  };
  const updItem = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("roadmap_items").update(patch as never).eq("id", id);
    if (error) toast({ title: "Not saved", description: error.message, variant: "destructive" }); else refresh();
  };
  const addItem = async (initiative_id: string) => {
    const { error } = await supabase.from("roadmap_items").insert({ initiative_id, task: "New task", owner: "Justin", lead_days: 7 } as never);
    if (error) toast({ title: "Not added", description: error.message, variant: "destructive" }); else refresh();
  };

  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Loading…</main>;
  if (!hasRole) return <Navigate to="/login" replace />;
  const rows = q.data ?? [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const span = daysBetween(T0, T1);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <header>
        <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Growth roadmap</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every switch starts OFF. At 8 AM on launch day it turns ON by itself only if the checklist is done and the gate passes.</p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold text-foreground">Timeline · Nov 2026 – Oct 2028</h2>
        <div className="mt-3 space-y-2">
          {rows.map((r) => {
            const dates = [r.launch_date, ...(r.extra_dates ?? [])];
            const start = dueDate(r.launch_date, Math.max(0, ...r.items.map((x) => x.lead_days)));
            const left = Math.max(0, daysBetween(T0, start)) / span * 100;
            const width = Math.max(1, daysBetween(start < T0 ? T0 : start, r.launch_date)) / span * 100;
            return (
              <div key={r.id} className="flex items-center gap-3 text-xs">
                <span className="w-40 shrink-0 truncate text-foreground">{r.name}</span>
                <div className="relative h-4 flex-1 rounded bg-muted/40">
                  <div className={`absolute h-4 rounded ${STATUS_CLS[r.status]}`} style={{ left: `${left}%`, width: `${width}%` }} />
                  {dates.map((d) => <div key={d} title={fmt(d)} className="absolute top-0 h-4 w-1 bg-foreground" style={{ left: `${daysBetween(T0, d) / span * 100}%` }} />)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {STATUSES.map((s) => <span key={s} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded ${STATUS_CLS[s]}`} />{s}</span>)}
        </div>
      </section>

      {rows.map((r) => <InitiativeCard key={r.id} r={r} today={today} upd={upd} updItem={updItem} addItem={addItem} />)}
    </main>
  );
}

function InitiativeCard({ r, today, upd, updItem, addItem }: { r: Row; today: string; upd: (id: string, p: Record<string, unknown>) => void; updItem: (id: string, p: Record<string, unknown>) => void; addItem: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const out = daysBetween(today, r.launch_date);
  return (
    <section className="rounded-xl border border-border bg-card p-5" data-testid={`initiative-${r.slug}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">{r.name}{r.is_template ? " (template)" : ""}</h2>
          <p className="text-sm text-muted-foreground">{r.summary} · {out >= 0 ? `${out} days out` : "launch date passed"} · checklist {pctDone(r)}%</p>
          {r.extra_dates?.length ? <p className="text-xs text-muted-foreground">Also: {r.extra_dates.map(fmt).join(" · ")}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${r.switch_on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>Switch {r.switch_on ? "ON" : "OFF"}</span>
          <button type="button" disabled={r.switch_on || r.is_template} onClick={() => { if (confirm(`Turn ${r.name} ON for customers now?`)) upd(r.id, { switch_on: true }); }}
            className="min-h-[44px] rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">Launch now</button>
          <button type="button" disabled={r.status === "paused"} onClick={() => upd(r.id, { status: "paused" })}
            className="min-h-[44px] rounded-lg border border-border px-3 text-sm font-semibold text-foreground disabled:opacity-50">Pause</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm"><span className="font-medium text-foreground">Launch date</span>
          <input type="date" defaultValue={r.launch_date} key={r.launch_date} onBlur={(e) => { if (e.target.value && e.target.value !== r.launch_date) upd(r.id, { launch_date: e.target.value }); }}
            className="mt-1 block min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-foreground" /></label>
        <label className="text-sm"><span className="font-medium text-foreground">Status</span>
          <select value={r.status} onChange={(e) => upd(r.id, { status: e.target.value })} className="mt-1 block min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-foreground">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="text-sm"><span className="font-medium text-foreground">Go / no-go gate</span>
          <span className="mt-1 flex min-h-[44px] items-center gap-2 text-foreground"><input type="checkbox" checked={r.gate_passed} onChange={(e) => upd(r.id, { gate_passed: e.target.checked })} className="h-5 w-5" />{r.gate_passed ? "Passed" : "Not passed"}</span>
          <span className="text-xs text-muted-foreground">{r.gate_description}</span></label>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Done</th><th>Task</th><th>Owner</th><th>Lead</th><th>Due</th><th>Note</th></tr></thead>
        <tbody className="divide-y divide-border">
          {r.items.map((x) => {
            const due = dueDate(r.launch_date, x.lead_days);
            const late = !x.done && due < today;
            return (
              <tr key={x.id} className="align-top">
                <td className="py-2"><input type="checkbox" checked={x.done} onChange={(e) => updItem(x.id, { done: e.target.checked })} className="h-5 w-5" aria-label={`Done: ${x.task}`} /></td>
                <td className="pr-2"><input defaultValue={x.task} onBlur={(e) => e.target.value !== x.task && updItem(x.id, { task: e.target.value })} className="w-full bg-transparent text-foreground" /></td>
                <td><select value={x.owner} onChange={(e) => updItem(x.id, { owner: e.target.value })} className="bg-transparent text-foreground">{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></td>
                <td><input type="number" defaultValue={x.lead_days} onBlur={(e) => Number(e.target.value) !== x.lead_days && updItem(x.id, { lead_days: Number(e.target.value) })} className="w-14 bg-transparent text-foreground" /></td>
                <td className={late ? "font-semibold text-destructive" : "text-foreground"}>{fmt(due)}</td>
                <td><input defaultValue={x.note ?? ""} onBlur={(e) => e.target.value !== (x.note ?? "") && updItem(x.id, { note: e.target.value || null })} className="w-full bg-transparent text-foreground" placeholder="—" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" onClick={() => addItem(r.id)} className="mt-2 text-sm font-semibold text-primary hover:underline">+ Add task</button>

      <div className="mt-4">
        <button type="button" onClick={() => setOpen(!open)} className="text-sm font-semibold text-primary hover:underline">{open ? "Hide" : "Show"} build prompt</button>
        {open && (
          <div className="mt-2 space-y-2">
            <textarea defaultValue={r.build_prompt ?? ""} rows={8} onBlur={(e) => e.target.value !== (r.build_prompt ?? "") && upd(r.id, { build_prompt: e.target.value || null })}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground" placeholder="Ready-to-paste instructions for a later build" />
            <button type="button" onClick={() => { void navigator.clipboard.writeText(r.build_prompt ?? ""); toast({ title: "Copied" }); }}
              className="min-h-[44px] rounded-lg border border-border px-3 text-sm font-semibold text-foreground">Copy build prompt</button>
          </div>
        )}
      </div>
    </section>
  );
}
