import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

const WINDOW_MS = 48 * 3_600_000;

/**
 * 48-hour guarantee: one tap, one optional sentence, no form.
 * Shown on a completed visit for 48 hours after it finished.
 * Pass `token` (from the post-visit email link) or `visitId` (signed-in member).
 */
export default function RedoButton({ visitId, token, completedAt, className = "" }: { visitId?: string; token?: string; completedAt?: string | null; className?: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error" | "closed">("idle");
  const [already, setAlready] = useState(false);

  useEffect(() => {
    if (!visitId) return;
    void supabase.from("redo_requests").select("id").eq("visit_id", visitId).neq("status", "canceled").maybeSingle()
      .then(({ data }) => { if (data) { setAlready(true); setState("done"); } });
  }, [visitId]);

  if (completedAt && Date.now() - new Date(completedAt).getTime() > WINDOW_MS) return null;

  const send = async () => {
    setState("sending");
    const { data, error } = await supabase.functions.invoke("redo-request", {
      body: { visit_id: visitId, token, note: note.trim() || undefined, source: token ? "email" : "dashboard" },
    });
    if (data?.error === "window_closed") return setState("closed");
    if (error || !data?.ok) return setState("error");
    setAlready(!!data.already);
    setState("done");
  };

  if (state === "done") {
    return (
      <p className={`rounded-lg border border-[hsl(var(--hairline))] bg-cream/50 px-3 py-2 text-sm text-ink ${className}`} data-testid="redo-sent">
        {already ? t("We already have this one — we're on it.") : t("Got it. We'll be in touch to schedule your free return visit.")}
      </p>
    );
  }
  if (state === "closed") return <p className={`text-sm text-ink-soft ${className}`}>{t("The 48-hour window for this visit has closed. Email hello@jointidy.co and we'll help.")}</p>;

  return (
    <div className={className}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} data-testid="redo-button"
          className="w-full rounded-lg border border-[hsl(var(--hairline))] py-2 text-sm font-medium text-ink transition hover:bg-cream">
          {t("Something wasn't right")}
        </button>
      ) : (
        <div className="space-y-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoFocus
            placeholder={t("What wasn't right? (optional)")} aria-label={t("What wasn't right? (optional)")}
            className="w-full rounded-lg border border-[hsl(var(--hairline))] bg-background px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <button type="button" onClick={send} disabled={state === "sending"} data-testid="redo-send"
            className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {state === "sending" ? t("Sending...") : t("Send — we'll come back free")}
          </button>
          {state === "error" && <p className="text-xs text-destructive">{t("Couldn't send — try again in a moment.")}</p>}
        </div>
      )}
    </div>
  );
}
