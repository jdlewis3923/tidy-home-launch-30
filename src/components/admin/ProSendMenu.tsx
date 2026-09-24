/**
 * Send menu — every email in the system for one Pro/applicant. Pick one, see
 * the exact email with their details, then Send now or Copy text. English +
 * Spanish, English only, or Spanish only. Nothing sends without a click.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, Mail, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RETAKE_REASONS } from "@/lib/photoRules";

const EMAILS: { key: string; label: string }[] = [
  { key: "onboarding", label: "Onboarding (welcome)" },
  { key: "background_check", label: "Background check invite" },
  { key: "insurance_request", label: "Insurance request" },
  { key: "contract", label: "Contract to sign" },
  { key: "badge_photo", label: "Badge photo" },
  { key: "photo_retake", label: "Ask for another photo" },
  { key: "all_set", label: "You're all set" },
  { key: "missing", label: "Missing items" },
  { key: "decline", label: "Decline" },
  { key: "tier2_offer", label: "Tier 2 offer" },
];

type Preview = { to: string; subject: string; html: string; text: string; note?: string | null };

export default function ProSendMenu({ applicantId, onSent }: { applicantId: string; onSent?: () => void }) {
  const [key, setKey] = useState("");
  const [lang, setLang] = useState<"both" | "en" | "es">("both");
  const [reason, setReason] = useState("blurry");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const call = (mode: "preview" | "send" | "test", k = key, l = lang) =>
    supabase.functions.invoke("pro-email", { body: { applicant_id: applicantId, email: k, mode, lang: l, reason } });

  const open = async (k: string, l = lang) => {
    setKey(k); setSentAt(null); setLoading(true); setPreview(null);
    const { data, error } = await call("preview", k, l);
    setLoading(false);
    const d = data as Preview & { ok?: boolean; message?: string; error?: string };
    if (error || !d?.ok) { setKey(""); return toast.error("Couldn't build that email", { description: d?.message ?? d?.error ?? error?.message }); }
    setPreview(d);
  };

  const send = async () => {
    if (!confirm(`Send "${preview?.subject}" to ${preview?.to}?`)) return;
    setSending(true);
    const { data, error } = await call("send");
    setSending(false);
    if (error || !(data as { ok?: boolean })?.ok) return toast.error("Not sent", { description: (data as { reason?: string })?.reason ?? error?.message });
    const at = new Date().toLocaleString();
    setSentAt(at);
    toast.success(`Sent to ${preview?.to}`);
    onSent?.();
  };

  const copy = async () => {
    if (!preview) return;
    await navigator.clipboard.writeText(preview.text);
    toast.success("Text copied — paste it into a message");
  };

  return (
    <>
      <select value="" onChange={(e) => e.target.value && void open(e.target.value)} aria-label="Send an email"
        className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold">
        <option value="">✉ Send an email…</option>
        {EMAILS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
      </select>
      <Dialog open={!!key} onOpenChange={(o) => { if (!o) { setKey(""); setPreview(null); } }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" />{EMAILS.find((e) => e.key === key)?.label}</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Language</span>
            {(["both", "en", "es"] as const).map((l) => (
              <button key={l} onClick={() => { setLang(l); void open(key, l); }}
                className={`rounded-full px-3 py-1 text-xs font-bold ${lang === l ? "bg-slate-900 text-white" : "border border-slate-300"}`}>
                {l === "both" ? "English + Spanish" : l === "en" ? "English only" : "Spanish only"}
              </button>
            ))}
            {key === "photo_retake" && (
              <select value={reason} onChange={(e) => { setReason(e.target.value); setTimeout(() => void open(key), 0); }} className="h-8 rounded-lg border px-2 text-xs">
                {RETAKE_REASONS.map((r) => <option key={r.key} value={r.key}>{r.en}</option>)}
              </select>
            )}
          </div>
          {loading && <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Building preview…</div>}
          {preview && (
            <>
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p><span className="text-slate-500">To:</span> <strong>{preview.to}</strong></p>
                <p><span className="text-slate-500">Subject:</span> <strong>{preview.subject}</strong></p>
                {preview.note && <p className="mt-1 text-amber-700">{preview.note}</p>}
              </div>
              <iframe title="Email preview" srcDoc={preview.html} className="h-[55vh] w-full rounded-lg border" />
              <div className="flex flex-wrap items-center gap-2">
                <button disabled={sending || !!sentAt} onClick={send} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send now
                </button>
                <button onClick={copy} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-bold"><Copy className="h-4 w-4" /> Copy text</button>
                {sentAt && <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Sent to {preview.to} · {sentAt}</span>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
