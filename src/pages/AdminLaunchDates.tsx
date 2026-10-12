/**
 * /admin/launch-dates — the one place launch dates live (launch_config).
 * Every page, email, text, the chatbot, the scheduler and the hire alerts read
 * these rows. Each change is logged with who made it.
 */
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { toast } from "@/hooks/use-toast";
import { fmtLaunchDate, type LaunchRow } from "@/lib/launch";

const FIELDS: { key: keyof LaunchRow; label: string }[] = [
  { key: "first_visit_date", label: "First visits" },
  { key: "conversion_date", label: "Reservations convert to paid" },
  { key: "late_first_visit_week", label: "First visit week for late reservations" },
  { key: "pro_callback_date", label: "Pro callback / hire date" },
  { key: "pro_ready_by", label: "Pro must be active by" },
];
const SCOPES = [["cleaning", "Cleaning"], ["lawn", "Lawn"], ["car", "Car care (Shine Complete + Car Wash Add-On)"]] as const;

export default function AdminLaunchDates() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const rows = useQuery({
    queryKey: ["launch_config_admin"], enabled: !!hasRole,
    queryFn: async () => {
      const { data, error } = await supabase.from("launch_config").select("*");
      if (error) throw error;
      return Object.fromEntries(((data ?? []) as unknown as LaunchRow[]).map((r) => [r.scope, r])) as Record<string, LaunchRow>;
    },
  });
  const log = useQuery({
    queryKey: ["launch_config_log"], enabled: !!hasRole,
    queryFn: async () => {
      const { data } = await supabase.from("launch_config_log").select("*").order("changed_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });
  const blackouts = useQuery({
    queryKey: ["blackouts_global"], enabled: !!hasRole,
    queryFn: async () => (await supabase.from("sched_blackouts").select("off_date, label, service, zip").order("off_date")).data ?? [],
  });

  const save = async (scope: string, field: string, value: string) => {
    setBusy(`${scope}.${field}`);
    const { error } = await supabase.rpc("admin_set_launch_config", { _scope: scope, _field: field, _value: value });
    setBusy(null);
    if (error) { toast({ title: "Not saved", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saved", description: "Every page, email and alert now uses the new date." });
    void qc.invalidateQueries({ queryKey: ["launch_config_admin"] });
    void qc.invalidateQueries({ queryKey: ["launch_config"] });
    void qc.invalidateQueries({ queryKey: ["launch_config_log"] });
  };

  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Loading…</main>;
  if (!hasRole) return <Navigate to="/login" replace />;
  const drops = rows.data?.global?.hanger_drops ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <header>
        <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Launch dates</h1>
        <p className="mt-1 text-sm text-muted-foreground">One place for every launch date. The site, emails, texts, chatbot, scheduler and hire alerts all read these.</p>
      </header>

      {SCOPES.map(([scope, label]) => (
        <section key={scope} className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold text-foreground">{label}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {FIELDS.map(({ key, label: fl }) => {
              const v = (rows.data?.[scope]?.[key] as string | null) ?? "";
              return (
                <label key={key} className="block text-sm">
                  <span className="font-medium text-foreground">{fl}</span>
                  <input type="date" defaultValue={v} key={v} disabled={busy === `${scope}.${key}`}
                    onBlur={(e) => { if (e.target.value !== v) void save(scope, key, e.target.value); }}
                    className="mt-1 block min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-foreground" />
                  <span className="text-xs text-muted-foreground">{v ? fmtLaunchDate(v) : "not set"}</span>
                </label>
              );
            })}
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold text-foreground">Door hanger drops</h2>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          {drops.map((d, i) => <li key={i}>Drop {i + 1}: {fmtLaunchDate(d.start)} – {fmtLaunchDate(d.end)}</li>)}
        </ul>
        <textarea key={JSON.stringify(drops)} defaultValue={JSON.stringify(drops)} rows={3}
          onBlur={(e) => { try { JSON.parse(e.target.value); if (e.target.value !== JSON.stringify(drops)) void save("global", "hanger_drops", e.target.value); } catch { toast({ title: "Not saved", description: "Use the format shown: start and end dates.", variant: "destructive" }); } }}
          className="mt-3 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground" />
        <p className="text-xs text-muted-foreground">Year-one print and drop tasks count from drop 1.</p>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold text-foreground">Blackout days (no visits)</h2>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          {(blackouts.data ?? []).map((b, i) => <li key={i}>{fmtLaunchDate(b.off_date)} — {b.label}{b.service ? ` · ${b.service}` : ""}{b.zip ? ` · ${b.zip}` : ""}</li>)}
        </ul>
        <Link to="/admin/calendar" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">Edit blackouts on the scheduling calendar</Link>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold text-foreground">Change log</h2>
        {(log.data ?? []).length === 0 && <p className="mt-2 text-sm text-muted-foreground">No changes yet.</p>}
        <ul className="mt-2 divide-y divide-border text-sm">
          {(log.data ?? []).map((l: { id: string; scope: string; field: string; old_value: string | null; new_value: string | null; changed_at: string }) => (
            <li key={l.id} className="py-2 text-foreground">{new Date(l.changed_at).toLocaleString()} · {l.scope} · {l.field}: {l.old_value ?? "—"} → {l.new_value ?? "—"}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
