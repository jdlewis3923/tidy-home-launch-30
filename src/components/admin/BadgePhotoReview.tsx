/** Badge photos waiting for review: Approve, or Ask for another with one reason. */
import { useEffect, useState } from "react";
import { Loader2, Check, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RETAKE_REASONS } from "@/lib/photoRules";

type Row = { id: string; applicant_id: string | null; badge_name: string | null; badge_photo_path: string | null; badge_photo_status: string | null; badge_photo_uploaded_at: string | null; url?: string | null };

export default function BadgePhotoReview() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase.from("pro_kit")
      .select("id, applicant_id, badge_name, badge_photo_path, badge_photo_status, badge_photo_uploaded_at")
      .not("badge_photo_path", "is", null)
      .order("badge_photo_uploaded_at", { ascending: false }).limit(40);
    const list = (data ?? []) as Row[];
    await Promise.all(list.map(async (r) => {
      const { data: s } = await supabase.storage.from("pro-badge-photos").createSignedUrl(r.badge_photo_path!, 600);
      r.url = s?.signedUrl ?? null;
    }));
    setRows(list);
  };
  useEffect(() => { void load(); }, []);

  const decide = async (r: Row, decision: "approve" | "retake") => {
    if (decision === "retake" && !reason[r.id]) return toast.error("Pick a reason first");
    if (decision === "retake" && !confirm(`Email ${r.badge_name ?? "this Pro"} asking for another photo?`)) return;
    setBusy(r.id);
    const { data, error } = await supabase.functions.invoke("badge-photo-decision", { body: { kit_id: r.id, decision, reason: reason[r.id] } });
    setBusy(null);
    if (error || !(data as { ok?: boolean })?.ok) return toast.error("That didn't go through");
    toast.success(decision === "approve" ? "Photo approved" : `Asked for another · sent ${new Date().toLocaleTimeString()}`);
    void load();
  };

  if (!rows) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading photos…</div>;
  if (!rows.length) return null;
  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-black uppercase tracking-wide text-slate-600">Badge photos</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="flex gap-3 rounded-xl border border-slate-200 p-3">
            <div className="w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100" style={{ aspectRatio: "3 / 4" }}>
              {r.url && <img src={r.url} alt={`Badge photo for ${r.badge_name ?? "Pro"}`} className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-bold text-slate-900">{r.badge_name ?? "Pro"}</p>
              <p className={`text-xs font-semibold ${r.badge_photo_status === "approved" ? "text-emerald-700" : r.badge_photo_status === "retake_requested" ? "text-amber-700" : "text-blue-700"}`}>
                {r.badge_photo_status === "approved" ? "Approved" : r.badge_photo_status === "retake_requested" ? "Asked for another" : "Waiting for review"}
              </p>
              {r.badge_photo_status !== "approved" && (
                <div className="mt-2 space-y-2">
                  <button disabled={busy === r.id} onClick={() => decide(r, "approve")} className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 text-xs font-bold text-white disabled:opacity-50">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <select value={reason[r.id] ?? ""} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} className="h-8 w-full rounded-lg border border-slate-300 px-2 text-xs">
                    <option value="">Reason…</option>
                    {RETAKE_REASONS.map((x) => <option key={x.key} value={x.key}>{x.en}</option>)}
                  </select>
                  <button disabled={busy === r.id} onClick={() => decide(r, "retake")} className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 disabled:opacity-50">
                    <RotateCcw className="h-3.5 w-3.5" /> Ask for another
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
