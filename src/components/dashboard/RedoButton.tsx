import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

const WINDOW_MS = 48 * 3_600_000;
type Item = { en: string; es: string; group_en: string | null; group_es: string | null };

/**
 * 48-hour guarantee. The member picks which INCLUDED items were missed — the
 * list is built from that visit's scope, so Not-included work can't be claimed.
 * A photo is optional but requested (signed-in members only).
 * Pass `token` (post-visit email link) or `visitId` (signed-in member).
 */
export default function RedoButton({ visitId, token, completedAt, className = "" }: { visitId?: string; token?: string; completedAt?: string | null; className?: string }) {
  const { t, language } = useLanguage();
  const es = language === "es";
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [excluded,setExcluded]=useState<Array<{en:string;es:string}>>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error" | "closed">("idle");
  const [already, setAlready] = useState(false);

  useEffect(() => {
    if (!visitId) return;
    void supabase.from("redo_requests").select("id").eq("visit_id", visitId).neq("status", "canceled").maybeSingle()
      .then(({ data }) => { if (data) { setAlready(true); setState("done"); } });
  }, [visitId]);

  useEffect(() => {
    if (!open || items) return;
    const q = token ? `t=${encodeURIComponent(token)}` : `visit_id=${visitId}`;
    void supabase.functions.invoke(`redo-request?${q}`, { method: "GET" }).then(({ data }) => {
      if (data?.window_open === false) setState("closed");
      setItems((data?.included_items as Item[]) ?? []);
      setExcluded(data?.excluded_items??[]);
    });
  }, [open, items, token, visitId]);

  if (completedAt && Date.now() - new Date(completedAt).getTime() > WINDOW_MS) return null;

  const send = async () => {
    if (!picked.length) return;
    setState("sending");
    let photo_path: string | undefined;
    if (photo && visitId) {
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        const path = `${u.user.id}/redo-${visitId}-${Date.now()}.${(photo.name.split(".").pop() || "jpg").slice(0, 5)}`;
        const { error: upErr } = await supabase.storage.from("claim-photos").upload(path, photo);
        if (!upErr) photo_path = path;
      }
    }
    const { data, error } = await supabase.functions.invoke("redo-request", {
      body: { visit_id: visitId, token, note: note.trim() || undefined, source: token ? "email" : "dashboard", missed_items: picked, photo_path },
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

  let lastGroup: string | null = null;
  return (
    <div className={className}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} data-testid="redo-button"
          className="w-full rounded-lg border border-[hsl(var(--hairline))] py-2 text-sm font-medium text-ink transition hover:bg-cream">
          {t("Something wasn't right")}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">{es ? "¿Qué cosa incluida faltó?" : "Which included item was missed?"}</p>
          {items === null ? <p className="text-xs text-ink-soft">{es ? "Cargando…" : "Loading…"}</p> : (
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-[hsl(var(--hairline))] p-2" data-testid="redo-items">
              {items.map((it) => {
                const g = es ? it.group_es : it.group_en;
                const head = g && g !== lastGroup ? ((lastGroup = g), <li key={`g-${g}`} className="pt-1 text-[11px] font-bold uppercase text-ink-soft">{g}</li>) : null;
                const label = es ? it.es : it.en;
                return [head, (
                  <li key={it.en}>
                    <label className="flex min-h-[44px] cursor-pointer items-start gap-2 text-[13px] text-ink">
                      <input type="checkbox" className="mt-1 h-4 w-4" checked={picked.includes(label)}
                        onChange={(e) => setPicked(e.target.checked ? [...picked, label] : picked.filter((p) => p !== label))} />
                      <span>{label}</span>
                    </label>
                  </li>
                )];
              })}
            </ul>
          )}
          <p className="text-[11px] text-ink-faint">{es ? "Solo se pueden elegir cosas incluidas en su visita." : "Only items included in your visit can be picked."}</p>
          {excluded.length>0&&<details className="text-sm text-foreground"><summary>{es?'¿Buscas trabajo no incluido?':'Looking for work not included?'}</summary><ul className="my-3 space-y-2">{excluded.map(row=><li key={row.en}>{es?row.es:row.en}</li>)}</ul><a href="/account/services" className="text-primary underline">{es?'Ver servicios adicionales de pago para tu próxima visita':'View paid add-ons for your next visit'}</a></details>}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
            placeholder={t("What wasn't right? (optional)")} aria-label={t("What wasn't right? (optional)")}
            className="w-full rounded-lg border border-[hsl(var(--hairline))] bg-background px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/40" />
          {visitId && (
            <label className="block text-xs text-ink-soft">
              {es ? "Una foto ayuda (opcional)" : "A photo helps (optional)"}
              <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
          )}
          <button type="button" onClick={send} disabled={state === "sending" || !picked.length} data-testid="redo-send"
            className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {state === "sending" ? t("Sending...") : t("Send — we'll come back free")}
          </button>
          {state === "error" && <p className="text-xs text-destructive">{t("Couldn't send — try again in a moment.")}</p>}
        </div>
      )}
    </div>
  );
}
