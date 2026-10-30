/**
 * /admin/service-scope — edit what each service includes. Publishing creates a
 * new scope version; existing members keep theirs for 30 days after notice.
 */
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { toast } from "@/hooks/use-toast";
import { SCOPE_TITLE, type ScopeRow, type ScopeService } from "@/lib/serviceScope";
import { useAddonCatalog } from '@/hooks/useAddonCatalog';
import { Button } from '@/components/ui/button';

const SERVICES: ScopeService[] = ["cleaning", "cleaning_deep_clean", "lawn", "car_wash", "car_detail"];
const SECTIONS = ["included", "not_included", "add_on", "customer_must", "notice"] as const;
type Draft = Pick<ScopeRow, "section" | "text_en" | "text_es" | "addon_key" | "group_en" | "group_es" | "notice_key" | "sort_order">;

export default function AdminServiceScope() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const qc = useQueryClient();
  const catalog = useAddonCatalog();
  const deep = catalog.data?.find(a => a.addon_key === 'deep_clean');
  const [minutes, setMinutes] = useState<Record<string, number>>({});
  useEffect(() => { if (deep?.added_minutes && typeof deep.added_minutes === 'object') setMinutes(deep.added_minutes as Record<string, number>); }, [deep]);
  const [svc, setSvc] = useState<ScopeService>("cleaning");
  const [draft, setDraft] = useState<Draft[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = useQuery({
    queryKey: ["scope_admin", svc], enabled: !!hasRole,
    queryFn: async () => (await supabase.from("service_scope").select("*").eq("service", svc).eq("active", true).order("sort_order")).data as ScopeRow[] ?? [],
  });
  const versions = useQuery({
    queryKey: ["scope_versions", svc], enabled: !!hasRole,
    queryFn: async () => (await supabase.from("scope_versions").select("*").eq("service", svc).order("scope_version", { ascending: false })).data ?? [],
  });
  useEffect(() => { if (rows.data) setDraft(rows.data.map(({ section, text_en, text_es, addon_key, group_en, group_es, notice_key, sort_order }) => ({ section, text_en, text_es, addon_key, group_en, group_es, notice_key, sort_order }))); }, [rows.data]);

  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Loading…</main>;
  if (!hasRole) return <Navigate to="/login" replace />;

  const set = (i: number, k: keyof Draft, v: string) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const publish = async () => {
    if (!note.trim()) { toast({ title: "Add a note", description: "Say what changed. Members see the new list on their Account page.", variant: "destructive" }); return; }
    if (!window.confirm("Publish a new version? Members are notified and keep their current list for 30 days.")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_publish_scope", { _service: svc, _rows: draft.map((r, i) => ({ ...r, sort_order: i })) as never, _note: note.trim() });
    setBusy(false);
    if (error) { toast({ title: "Not published", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Version ${data} published` });
    setNote("");
    void qc.invalidateQueries({ queryKey: ["scope_admin"] });
    void qc.invalidateQueries({ queryKey: ["scope_versions"] });
    void qc.invalidateQueries({ queryKey: ["service_scope"] });
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Service scope</h1>
        <p className="mt-1 text-sm text-muted-foreground">What each visit includes, in English and Spanish. Every page, email, the terms and the Pro job card read this.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {svc === 'cleaning' && deep && <section className="w-full space-y-3 border-y border-border py-4">
          <h2 className="font-bold text-foreground">Deep Clean · added minutes by size</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[1,2,3,4,5].map(size => <label key={size} className="text-sm text-foreground">{size < 4 ? `Size ${size}` : size === 4 ? 'Estate' : 'Estate Plus'}<input type="number" min={1} max={600} value={minutes[size] ?? ''} onChange={e => setMinutes({...minutes,[size]:Number(e.target.value)})} className="mt-1 w-full rounded border border-input bg-background p-2" /></label>)}</div>
          <Button onClick={async () => { const {error} = await supabase.rpc('admin_deep_clean_minutes',{_minutes:minutes}); toast({title:error?'Not saved':'Minutes saved',description:error?.message,variant:error?'destructive':'default'}); if(!error) void catalog.refetch(); }}>Save Deep Clean minutes</Button>
        </section>}
        {SERVICES.map((s) => (
          <button key={s} type="button" onClick={() => setSvc(s)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${svc === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}>
            {SCOPE_TITLE[s][0].split(" — ")[0]}
          </button>
        ))}
      </div>
      <section className="space-y-3">
        {draft.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-[140px_1fr_1fr_auto]">
            <select value={r.section} onChange={(e) => set(i, "section", e.target.value)} className="rounded border border-input bg-background p-2 text-sm">
              {SECTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
            <textarea value={r.text_en} onChange={(e) => set(i, "text_en", e.target.value)} rows={2} className="rounded border border-input bg-background p-2 text-sm" aria-label="English" />
            <textarea value={r.text_es} onChange={(e) => set(i, "text_es", e.target.value)} rows={2} className="rounded border border-input bg-background p-2 text-sm" aria-label="Spanish" />
            <button type="button" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="text-sm text-destructive">Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setDraft((d) => [...d, { section: "included", text_en: "", text_es: "", addon_key: null, group_en: null, group_es: null, notice_key: null, sort_order: d.length }])}
          className="rounded-lg border border-dashed border-border px-4 py-2 text-sm font-semibold text-foreground">+ Add line</button>
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <label className="block text-sm font-medium text-foreground">What changed (required)
          <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded border border-input bg-background p-2 text-sm" />
        </label>
        <button type="button" disabled={busy} onClick={() => void publish()} className="mt-3 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
          Publish new version
        </button>
      </section>
      <section>
        <h2 className="text-lg font-bold text-foreground">Versions</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {(versions.data ?? []).map((v) => (
            <li key={v.scope_version}>v{v.scope_version} · published {new Date(v.published_at).toLocaleString()} · existing members from {v.existing_members_from ? new Date(v.existing_members_from).toLocaleDateString() : "—"}{v.change_note ? ` · ${v.change_note}` : ""}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
