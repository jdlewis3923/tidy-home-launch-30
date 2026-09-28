/**
 * The one next move for a Pro. Stage comes from applicants.sequence_stage;
 * gates are computed at render from live facts and lock the button, with the
 * missing items written on the button itself. The server re-checks the gate.
 */
import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  NEXT_ACTION, STAGE_INFO, gateMissing, CONFIRMATION_TICKS, type SequenceStage, type GateFacts,
} from "@/lib/onboardingSequence";

type Kit = { status: string | null; badge_photo_status: string | null; expected_delivery_date: string | null };

export default function NextActionCard({ applicant, onDone }: { applicant: Record<string, any>; onDone: () => void }) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState("");
  const [date, setDate] = useState("");
  const [preview, setPreview] = useState<{ subject: string; html: string; to: string } | null>(null);

  useEffect(() => {
    void supabase.from("pro_kit").select("status, badge_photo_status, expected_delivery_date")
      .eq("applicant_id", applicant.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setKit((data as Kit) ?? null));
  }, [applicant.id, applicant.sequence_stage]);

  const stage = (applicant.sequence_stage ?? "applied") as SequenceStage;
  const info = STAGE_INFO[stage];
  const next = NEXT_ACTION[stage];
  const facts: GateFacts = { ...applicant, kit_status: kit?.status ?? null, badge_photo_status: kit?.badge_photo_status ?? null, expected_delivery_date: kit?.expected_delivery_date ?? null };
  const missing = next?.gate ? gateMissing(next.gate, facts) : [];
  const gc = (applicant.gate_confirmations ?? {}) as Record<string, unknown>;
  const needsInput = next?.action === "book_interview" ? !when : next?.action === "kit_ordered" ? !date : false;

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("sequence-advance", { body: { applicant_id: applicant.id, action, ...extra } });
    setBusy(false);
    const d = data as any;
    if (error || !d?.ok) {
      const ctx = await (error as any)?.context?.json?.().catch(() => null);
      const body = ctx ?? d ?? {};
      toast.error("Not done", { description: body.missing?.length ? `Missing: ${body.missing.join(", ")}` : body.detail?.reason ?? body.error ?? error?.message });
      onDone();
      return false;
    }
    if (d.open) { window.open(d.open, "_self"); return true; }
    toast.success("Done");
    onDone();
    return true;
  };

  const onPress = async () => {
    if (!next) return;
    if (next.action === "send_onboarding" || next.action === "send_contract") {
      setBusy(true);
      const { data } = await supabase.functions.invoke("pro-email", { body: { applicant_id: applicant.id, email: next.action === "send_onboarding" ? "onboarding" : "contract", mode: "preview" } });
      setBusy(false);
      const d = data as any;
      if (!d?.html) { toast.error("Preview failed", { description: d?.error }); return; }
      setPreview({ subject: d.subject, html: d.html, to: d.to });
      return;
    }
    await call(next.action, next.action === "book_interview" ? { scheduled_at: new Date(when).toISOString() } : next.action === "kit_ordered" ? { date } : {});
  };

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Next step</div>
          <div className="text-sm font-semibold text-foreground">{info.label}</div>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {info.waitingOn === "you" ? "Waiting on you" : info.waitingOn === "them" ? "Waiting on them" : info.waitingOn === "auto" ? "System is working" : ""}
        </span>
      </div>

      {next?.action === "book_interview" && (
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
      )}
      {next?.action === "kit_ordered" && (
        <label className="block text-xs text-muted-foreground">Expected delivery
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
        </label>
      )}

      {next ? (
        <Button onClick={onPress} disabled={busy || missing.length > 0 || needsInput} className="w-full h-auto min-h-10 whitespace-normal text-left justify-start">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : missing.length ? <Lock className="h-4 w-4 mr-2 shrink-0" /> : null}
          <span>
            {next.label}
            {missing.length > 0 && <span className="block text-[11px] font-normal opacity-90">Locked — missing: {missing.join(" · ")}</span>}
          </span>
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          {stage === "contract_sent" ? "Nothing to press — the stage moves by itself when they sign."
            : stage === "kit_ordered" ? "Nothing to press — “You’re all set” goes out by itself once all five are green."
            : stage === "active" ? "Active. Nothing left in the sequence." : "Closed."}
        </p>
      )}

      <div className="space-y-1">
        {CONFIRMATION_TICKS.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-xs text-foreground">
            <input type="checkbox" checked={gc[t.key] === true} disabled={busy}
              onChange={(e) => void call("confirm", { key: t.key, value: e.target.checked })} />
            {t.label} <span className="text-muted-foreground">(gate {t.gate})</span>
          </label>
        ))}
      </div>

      {!["declined", "active"].includes(stage) && (
        <div className="flex gap-3 text-[11px]">
          <button type="button" className="underline text-muted-foreground" disabled={busy}
            onClick={() => { if (confirm("Decline and send the “not moving forward” email?")) void call("decline"); }}>Decline</button>
          {stage !== "hold" && <button type="button" className="underline text-muted-foreground" disabled={busy} onClick={() => void call("hold")}>Hold</button>}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{preview?.subject}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">To: {preview?.to}</p>
          <iframe title="Email preview" srcDoc={preview?.html} className="w-full h-[60vh] rounded border border-border bg-background" />
          <DialogFooter>
            <Button disabled={busy} onClick={async () => { if (next && (await call(next.action))) setPreview(null); }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send & advance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
