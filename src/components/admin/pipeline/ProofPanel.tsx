/** Proof panel on /admin/pipeline/:id — every item inline with Approve / Reject + reason, and the reference call. */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PROOF_REJECT_REASONS, rpcMessage } from "@/lib/pipeline";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export default function ProofPanel({ id, p, onChange }: { id: string; p: Record<string, any>; onChange: () => void }) {
  const [slots, setSlots] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [refNotes, setRefNotes] = useState<string>(p.ref_notes ?? "");

  const load = useCallback(async () => {
    const [s, i] = await Promise.all([
      db.rpc("pipeline_proof_slots", { _service: p.service }),
      db.from("pipeline_proof_items").select("*").eq("applicant_id", id),
    ]);
    const all = [...(s.data ?? []).sort((a: any, b: any) => a.sort - b.sort),
      ...[1, 2, 3].map((n) => ({ slot: `work:${n}`, kind: "work", label_en: `Job photo ${n}` }))];
    setSlots(all);
    const map = Object.fromEntries((i.data ?? []).map((r: any) => [r.slot, r]));
    setItems(map);
    const paths = (i.data ?? []).map((r: any) => r.storage_path);
    if (paths.length) {
      const { data } = await supabase.storage.from("pipeline-proof").createSignedUrls(paths, 3600);
      const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
      setUrls(Object.fromEntries((i.data ?? []).map((r: any) => [r.slot, byPath.get(r.storage_path) ?? ""])));
    }
  }, [id, p.service]);
  useEffect(() => { void load(); }, [load]);

  const review = async (slot: string, approve: boolean) => {
    const { error } = await db.rpc("pipeline_proof_review", { _id: id, _slot: slot, _approve: approve, _reason: approve ? null : reason[slot] ?? null, _note: note[slot] ?? null });
    if (error) { toast.error(rpcMessage(error)); return; }
    toast.success(approve ? "Approved." : "Rejected — the candidate gets a link to redo only this item.");
    await load(); onChange();
  };
  const refSet = async (status: string) => {
    const { error } = await db.rpc("pipeline_reference_review", { _id: id, _status: status, _notes: refNotes });
    if (error) toast.error(rpcMessage(error)); else { toast.success("Saved."); onChange(); }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">Equipment proof</h2>
        <span className="text-xs text-muted-foreground">
          {p.proof_approved_at ? `Approved ${new Date(p.proof_approved_at).toLocaleString()}` : p.proof_submitted_at ? `Submitted ${new Date(p.proof_submitted_at).toLocaleString()}` : p.proof_link_sent_at ? `Link sent ${new Date(p.proof_link_sent_at).toLocaleString()} — not submitted` : "Link not sent yet"}
          {p.experience_level ? ` · experience: ${p.experience_level}` : ""}
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {slots.map((s) => {
          const it = items[s.slot]; const url = urls[s.slot];
          return (
            <li key={s.slot} className="rounded-md border border-border p-2 text-sm">
              <p className="font-semibold">{s.kind === "video" ? "Video: " : s.kind === "vehicle" ? "" : s.kind === "work" ? "" : "Photo: "}{s.label_en}</p>
              {!it ? <p className="text-xs text-muted-foreground">Not uploaded</p> : (
                <>
                  {url && (it.mime ?? "").startsWith("video/") ? <video src={url} controls className="mt-1 max-h-56 w-full rounded bg-muted" />
                    : url ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={s.label_en} className="mt-1 max-h-56 w-full rounded object-contain bg-muted" /></a> : null}
                  <p className={`mt-1 text-xs font-semibold ${it.status === "approved" ? "text-primary" : it.status === "rejected" ? "text-destructive" : "text-muted-foreground"}`}>
                    {it.status}{it.reject_reason ? ` — ${it.reject_reason}${it.reject_note ? `: ${it.reject_note}` : ""}` : ""}
                  </p>
                  {it.status === "pending" && (
                    <div className="mt-2 space-y-1">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" onClick={() => void review(s.slot, true)}>Approve</Button>
                        <select aria-label="Reject reason" value={reason[s.slot] ?? ""} onChange={(e) => setReason((r) => ({ ...r, [s.slot]: e.target.value }))} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                          <option value="">Reject reason…</option>
                          {PROOF_REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <Button size="sm" variant="destructive" disabled={!reason[s.slot]} onClick={() => void review(s.slot, false)}>Reject</Button>
                      </div>
                      {reason[s.slot] === "Other" && <Textarea rows={2} placeholder="Reason" value={note[s.slot] ?? ""} onChange={(e) => setNote((n) => ({ ...n, [s.slot]: e.target.value }))} />}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 rounded-md border border-border p-3 text-sm">
        <p className="font-semibold">Reference {p.experience_level === "none" ? "(required — no experience)" : "(or 3 job photos)"}</p>
        {p.ref_name ? <p>{p.ref_name} · {p.ref_phone} · {p.ref_relationship}</p> : <p className="text-muted-foreground">None given.</p>}
        <p className="text-xs text-muted-foreground">Tidy sends nothing to the reference. You call. Status: {p.ref_status}</p>
        {p.ref_name && (
          <div className="mt-2 space-y-2">
            <Textarea rows={2} placeholder="Call notes" value={refNotes} onChange={(e) => setRefNotes(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void refSet("confirmed")}>Called — confirmed</Button>
              <Button size="sm" variant="outline" onClick={() => void refSet("not_confirmed")}>Called — not confirmed</Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
