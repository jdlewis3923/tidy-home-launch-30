/**
 * Hiring documents (role one-pagers per service per language, Spanish ICA) and the
 * standing warnings when one is missing. Also edits the equipment checklists.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PIPELINE_SERVICES } from "@/lib/pipeline";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;
const SLOTS = [
  ...PIPELINE_SERVICES.flatMap((s) => (["en", "es"] as const).map((l) => ({ key: `one_pager:${s.key}:${l}`, label: `${s.label} one-pager (${l.toUpperCase()})` }))),
  { key: "ica:es", label: "Spanish ICA (lawyer-supplied, never machine-translated)" },
];

export default function HiringDocsPanel() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [onFile, setOnFile] = useState<Record<string, string>>({});
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const [w, d, i] = await Promise.all([
      db.rpc("pipeline_doc_warnings"),
      db.from("company_documents").select("doc_key, filename").in("doc_key", SLOTS.map((s) => s.key)).eq("current_version", true).is("archived_at", null),
      db.from("pipeline_equipment_items").select("*").order("service").order("sort"),
    ]);
    setWarnings(w.data ?? []);
    setOnFile(Object.fromEntries((d.data ?? []).map((r: any) => [r.doc_key, r.filename])));
    setItems(i.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const upload = async (docKey: string, file: File) => {
    const path = `hiring/${docKey.replace(/:/g, "_")}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("company-docs").upload(path, file);
    if (up.error) { toast.error(up.error.message); return; }
    await db.from("company_documents").update({ current_version: false }).eq("doc_key", docKey);
    const { error } = await db.from("company_documents").insert({
      doc_key: docKey, filename: file.name, title: SLOTS.find((s) => s.key === docKey)?.label, category: "Hiring",
      storage_path: path, mime_type: file.type, file_size_bytes: file.size, current_version: true, admin_only: true, tags: ["hiring", docKey],
    });
    if (error) toast.error(error.message); else { toast.success("Uploaded."); await load(); }
  };
  const saveItem = async (it: any, patch: Record<string, unknown>) => {
    const { error } = await db.from("pipeline_equipment_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", it.id);
    if (error) toast.error(error.message); else await load();
  };

  return (
    <section className="space-y-2">
      {warnings.map((w) => <p key={w} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{w}</p>)}
      <button className="text-sm font-semibold text-primary underline" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Show"} hiring documents and equipment checklists</button>
      {open && (
        <div className="grid gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 text-base font-bold">Hiring documents</h2>
            <ul className="space-y-2 text-sm">{SLOTS.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.label}:</span>
                <span className={onFile[s.key] ? "text-muted-foreground" : "text-destructive"}>{onFile[s.key] ?? "missing"}</span>
                <input type="file" accept=".pdf" aria-label={`Upload ${s.label}`} className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(s.key, f); e.target.value = ""; }} />
              </li>))}</ul>
          </div>
          <div>
            <h2 className="mb-2 text-base font-bold">Equipment checklists</h2>
            {PIPELINE_SERVICES.map((svc) => (
              <div key={svc.key} className="mb-3">
                <p className="text-xs font-bold uppercase text-muted-foreground">{svc.label}</p>
                <ul className="space-y-1">{items.filter((i) => i.service === svc.key).map((it) => (
                  <li key={it.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-1 text-xs">
                    <Input defaultValue={it.label_en} onBlur={(e) => e.target.value !== it.label_en && saveItem(it, { label_en: e.target.value })} aria-label="English label" />
                    <Input defaultValue={it.label_es} onBlur={(e) => e.target.value !== it.label_es && saveItem(it, { label_es: e.target.value })} aria-label="Spanish label" />
                    <label className="flex items-center gap-1"><input type="checkbox" checked={it.needs_video} disabled={it.is_vehicle} onChange={(e) => saveItem(it, { needs_video: e.target.checked })} />video</label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={it.active} onChange={(e) => saveItem(it, { active: e.target.checked })} />on</label>
                  </li>))}</ul>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => void load()}>Refresh</Button>
          </div>
        </div>
      )}
    </section>
  );
}
