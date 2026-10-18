/**
 * Hiring content — /admin/hiring/content (hiring v5)
 * Edit the /apply question bank and the candidate FAQ. Changes go live without a deploy.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Q = {
  id: string; key: string; service: string | null; section: number; type: string;
  label_en: string; label_es: string; active: boolean; sort: number;
};
type Faq = {
  id: string; q_en: string; a_en: string; q_es: string; a_es: string;
  sort: number; candidate_visible: boolean; needs_justin: boolean;
};

export default function HiringContent() {
  const [qs, setQs] = useState<Q[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: q }, { data: f }] = await Promise.all([
      supabase.from("question_bank").select("id, key, service, section, type, label_en, label_es, active, sort").order("section").order("sort"),
      supabase.from("candidate_faq").select("*").order("sort"),
    ]);
    setQs((q as Q[]) ?? []);
    setFaqs((f as Faq[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveQ = async (row: Q) => {
    setSaving(row.id);
    const { error } = await supabase.from("question_bank")
      .update({ label_en: row.label_en, label_es: row.label_es, active: row.active }).eq("id", row.id);
    setSaving(null);
    if (error) toast({ title: error.message, variant: "destructive" });
    else toast({ title: "Saved — live on /apply now" });
  };

  const saveFaq = async (row: Faq) => {
    setSaving(row.id);
    const { error } = await supabase.from("candidate_faq")
      .update({ q_en: row.q_en, a_en: row.a_en, q_es: row.q_es, a_es: row.a_es, candidate_visible: row.candidate_visible, needs_justin: row.needs_justin })
      .eq("id", row.id);
    setSaving(null);
    if (error) toast({ title: error.message, variant: "destructive" });
    else toast({ title: "Saved" });
  };

  const setQ = (id: string, patch: Partial<Q>) => setQs((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setF = (id: string, patch: Partial<Faq>) => setFaqs((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const isPayRow = (f: Faq) => /paid|pay|pago|cobro/i.test(f.q_en);
  const payEmpty = (f: Faq) => !f.a_en?.trim() || !f.a_es?.trim();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Hiring content</h1>

      <section className="rounded-xl border border-border bg-card p-5 mb-8">
        <h2 className="font-semibold text-foreground mb-1">Candidate FAQ</h2>
        <p className="text-xs text-muted-foreground mb-4">Shown on /apply and on the phone scorecard. The pay-timing row stays red until both languages are filled.</p>
        <div className="grid gap-4">
          {faqs.map((f) => (
            <div key={f.id} className={`rounded-lg border p-4 ${isPayRow(f) && payEmpty(f) ? "border-red-400 bg-red-50" : "border-border"}`}>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Question (EN)</label>
                  <Input value={f.q_en} onChange={(e) => setF(f.id, { q_en: e.target.value })} className="mt-1" />
                  <label className="text-xs font-medium text-muted-foreground mt-2 block">Answer (EN)</label>
                  <Textarea value={f.a_en} onChange={(e) => setF(f.id, { a_en: e.target.value })} rows={2} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Pregunta (ES)</label>
                  <Input value={f.q_es} onChange={(e) => setF(f.id, { q_es: e.target.value })} className="mt-1" />
                  <label className="text-xs font-medium text-muted-foreground mt-2 block">Respuesta (ES)</label>
                  <Textarea value={f.a_es} onChange={(e) => setF(f.id, { a_es: e.target.value })} rows={2} className="mt-1" />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-foreground">
                  <input type="checkbox" checked={f.candidate_visible} onChange={(e) => setF(f.id, { candidate_visible: e.target.checked })} /> Candidate-visible
                </label>
                <label className="flex items-center gap-1.5 text-xs text-foreground">
                  <input type="checkbox" checked={f.needs_justin} onChange={(e) => setF(f.id, { needs_justin: e.target.checked })} /> Needs Justin
                </label>
                <span className="flex-1" />
                <Button size="sm" onClick={() => saveFaq(f)} disabled={saving === f.id}>{saving === f.id ? "…" : "Save"}</Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground mb-1">Application question bank</h2>
        <p className="text-xs text-muted-foreground mb-4">Edits show on /apply immediately — no deploy. Uncheck "Active" to hide a question.</p>
        <div className="grid gap-3">
          {qs.map((q) => (
            <div key={q.id} className={`rounded-lg border border-border p-3 ${q.active ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <span className="font-mono">{q.key}</span>
                <span>· §{q.section}</span>
                <span>· {q.type}</span>
                {q.service ? <span>· {q.service}</span> : null}
                <label className="ml-auto flex items-center gap-1.5 text-foreground">
                  <input type="checkbox" checked={q.active} onChange={(e) => setQ(q.id, { active: e.target.checked })} /> Active
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={q.label_en} onChange={(e) => setQ(q.id, { label_en: e.target.value })} placeholder="English label" />
                <Input value={q.label_es} onChange={(e) => setQ(q.id, { label_es: e.target.value })} placeholder="Etiqueta en español" />
              </div>
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => saveQ(q)} disabled={saving === q.id}>{saving === q.id ? "…" : "Save"}</Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
