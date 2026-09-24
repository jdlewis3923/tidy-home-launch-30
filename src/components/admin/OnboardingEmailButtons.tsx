/**
 * Tidy — one button per onboarding email.
 *
 * Every message a new Pro receives during onboarding can be sent from here:
 * "Test to me" sends the identical email to hello@jointidy.co and changes
 * nothing on the Pro's record, "Send to Pro" sends the real thing after a
 * confirmation. Each row shows when it last went out, so nothing gets fired at
 * the same Pro twice by accident.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Eye, Loader2, Mail, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type EmailKey =
  | "welcome"
  | "reminder"
  | "kit_order"
  | "insurance_approved"
  | "insurance_rejected"
  | "insurance_expiring"
  | "contract"
  | "photo_id";

const EMAILS: { key: EmailKey; title: string; note: string }[] = [
  {
    key: "welcome",
    title: "Welcome — all three steps",
    note: "Background check, insurance certificate, sizes and kit, in one email.",
  },
  {
    key: "reminder",
    title: "Reminder — what is still missing",
    note: "Lists only the steps this Pro has not finished yet.",
  },
  {
    key: "contract",
    title: "Contractor agreement — sign",
    note: "Link to read and sign the independent contractor agreement.",
  },
  {
    key: "photo_id",
    title: "Photo ID upload",
    note: "Link to upload the photo for the Tidy ID badge.",
  },
  {
    key: "kit_order",
    title: "Kit order + Pro confirmation",
    note: "Your paste-ready vendor order, and the Pro's kit confirmation with the badge photo link.",
  },
  {
    key: "insurance_approved",
    title: "Insurance approved",
    note: "Sent when a certificate is verified. Real sends usually happen from the insurance review.",
  },
  {
    key: "insurance_rejected",
    title: "Insurance needs fixing",
    note: "What is wrong with the certificate and how to resend it.",
  },
  {
    key: "insurance_expiring",
    title: "Insurance expiring",
    note: "The 30-day heads-up before a policy lapses.",
  },
];

export default function OnboardingEmailButtons({
  applicantId,
  applicantEmail,
  onRefresh,
}: {
  applicantId: string;
  applicantEmail?: string | null;
  onRefresh?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{
    key: EmailKey; title: string; to?: string; subject?: string; html?: string | null; note?: string;
    loading: boolean; error?: string; sentAt?: string; sentTo?: string;
  } | null>(null);

  const openPreview = async (key: EmailKey, title: string) => {
    setPreview({ key, title, loading: true });
    const { data, error } = await supabase.functions.invoke("onboarding-email-send", {
      body: { applicant_id: applicantId, email: key, mode: "preview" },
    });
    const d = data as { ok?: boolean; to?: string; subject?: string; html?: string | null; note?: string; reason?: string; error?: string } | null;
    if (error || !d?.ok) {
      setPreview({ key, title, loading: false, error: d?.reason ?? d?.error ?? error?.message ?? "Preview failed" });
      return;
    }
    setPreview({ key, title, loading: false, to: d.to, subject: d.subject, html: d.html, note: d.note });
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from("onboarding_events")
      .select("event, created_at, metadata")
      .eq("applicant_id", applicantId)
      .order("created_at", { ascending: false })
      .limit(60);
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      const ev = String(row.event ?? "");
      if (!ev.startsWith("email_sent:")) continue;
      const mode = (row.metadata as { mode?: string } | null)?.mode === "test" ? "test" : "pro";
      const id = `${ev.slice("email_sent:".length)}:${mode}`;
      if (!map[id]) map[id] = row.created_at as string;
    }
    // The welcome email is also sent by the pipeline itself.
    for (const row of data ?? []) {
      if (row.event === "onboarding_email_sent" && !map["welcome:pro"]) {
        map["welcome:pro"] = row.created_at as string;
      }
    }
    setLastSent(map);
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicantId]);

  const send = async (key: EmailKey, mode: "pro" | "test", title: string, skipConfirm = false) => {
    if (mode === "pro" && !skipConfirm) {
      const previously = lastSent[`${key}:pro`];
      const who = applicantEmail ?? "this Pro";
      const warning = previously
        ? `"${title}" already went to ${who} on ${new Date(previously).toLocaleString()}. Send it again?`
        : `Send "${title}" to ${who} now?`;
      if (!window.confirm(warning)) return;
    }
    setBusy(`${key}:${mode}`);
    const { data, error } = await supabase.functions.invoke("onboarding-email-send", {
      body: { applicant_id: applicantId, email: key, mode },
    });
    setBusy(null);
    const ok = !error && (data as { ok?: boolean })?.ok === true;
    if (!ok) {
      const d = data as { error?: string; reason?: string; details?: unknown } | null;
      toast.error(`${title} did not send`, {
        description: d?.reason ?? d?.error ?? error?.message ?? "unknown problem",
      });
      return false;
    }
    const sentTo = mode === "test" ? "hello@jointidy.co" : applicantEmail ?? "the Pro";
    setPreview((p) => (p && p.key === key ? { ...p, sentAt: new Date().toISOString(), sentTo } : p));
    toast.success(
      mode === "test" ? `Test sent to hello@jointidy.co — ${title}` : `Sent to ${applicantEmail ?? "the Pro"}`,
    );
    void loadHistory();
    onRefresh?.();
    return true;
  };

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
      <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Mail className="h-4 w-4" /> Onboarding emails
      </h4>
      <p className="text-[11px] text-muted-foreground">
        Test sends go to hello@jointidy.co and never touch this Pro's record.
      </p>
      {EMAILS.map((e) => {
        const sentPro = lastSent[`${e.key}:pro`];
        const sentTest = lastSent[`${e.key}:test`];
        return (
          <div key={e.key} className="rounded-lg border border-border/70 p-2.5">
            <p className="text-[13px] font-semibold text-foreground">{e.title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{e.note}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => openPreview(e.key, e.title)}>
                <Eye className="mr-1 h-3.5 w-3.5" /> Preview
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => send(e.key, "test", e.title)}
              >
                {busy === `${e.key}:test` ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mail className="mr-1 h-3.5 w-3.5" />
                )}
                Test to me
              </Button>
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => send(e.key, "pro", e.title)}
              >
                {busy === `${e.key}:pro` ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1 h-3.5 w-3.5" />
                )}
                {sentPro ? "Send again" : "Send to Pro"}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {sentPro ? `Sent to the Pro ${new Date(sentPro).toLocaleString()}` : "Never sent to this Pro"}
              {sentTest ? ` · last test ${new Date(sentTest).toLocaleString()}` : ""}
            </p>
          </div>
        );
      })}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
          </DialogHeader>
          {preview?.loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Building preview…
            </div>
          ) : preview?.error ? (
            <p className="text-sm text-destructive">{preview.error}</p>
          ) : preview ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border p-2 text-xs">
                <div><span className="text-muted-foreground">To:</span> <b>{preview.to}</b></div>
                <div><span className="text-muted-foreground">Subject:</span> <b>{preview.subject}</b></div>
              </div>
              {preview.html ? (
                <iframe title="Email preview" srcDoc={preview.html} className="h-[55vh] w-full rounded-md border border-border bg-background" />
              ) : (
                <p className="text-sm text-muted-foreground">{preview.note}</p>
              )}
              {preview.sentAt ? (
                <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Sent to {preview.sentTo} · {new Date(preview.sentAt).toLocaleString()}
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" disabled={busy !== null} onClick={() => send(preview.key, "test", preview.title)}>
                    <Mail className="mr-1 h-4 w-4" /> Test to me
                  </Button>
                  <Button disabled={busy !== null} onClick={() => send(preview.key, "pro", preview.title)}>
                    {busy === `${preview.key}:pro` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                    Send to {preview.to}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
