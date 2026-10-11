import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

const WINDOW_MS = 24 * 3_600_000;

/** Report damage within 24 hours of the visit, with photos. No payout is promised here. */
export default function DamageClaim({ visitId, completedAt }: { visitId: string; completedAt: string }) {
  const { language } = useLanguage();
  const es = language === "es";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  if (Date.now() - new Date(completedAt).getTime() > WINDOW_MS) return null;

  const send = async () => {
    if (text.trim().length < 10 || !files.length) return;
    setState("sending");
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return setState("error");
    const paths: string[] = [];
    for (const f of files.slice(0, 6)) {
      const path = `${u.user.id}/damage-${visitId}-${Date.now()}-${paths.length}.${(f.name.split(".").pop() || "jpg").slice(0, 5)}`;
      const { error } = await supabase.storage.from("claim-photos").upload(path, f);
      if (error) return setState("error");
      paths.push(path);
    }
    const { error } = await supabase.from("damage_claims").insert({ visit_id: visitId, user_id: u.user.id, description: text.trim(), photo_paths: paths });
    setState(error ? "error" : "done");
  };

  if (state === "done") return <p className="mt-3 rounded-lg border border-[hsl(var(--hairline))] bg-white p-3 text-sm text-ink">{es ? "Recibimos su reporte. Lo revisaremos con las fotos de la visita y le escribiremos." : "We got your report. We'll review it with the visit photos and get back to you."}</p>;
  return (
    <div className="mt-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full rounded-lg border border-[hsl(var(--hairline))] py-2 text-sm font-medium text-ink hover:bg-cream">
          {es ? "Reportar un daño (dentro de 24 horas)" : "Report damage (within 24 hours)"}
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-[hsl(var(--hairline))] bg-white p-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3}
            placeholder={es ? "¿Qué se dañó y dónde?" : "What was damaged, and where?"}
            className="w-full rounded-lg border border-[hsl(var(--hairline))] bg-background px-3 py-2 text-sm text-ink" />
          <label className="block text-xs text-ink-soft">{es ? "Fotos (obligatorias)" : "Photos (required)"}
            <input type="file" accept="image/*" multiple className="mt-1 block w-full text-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
          <p className="text-[11px] text-ink-faint">{es ? "El daño previo es el que aparece en las fotos de la primera visita y de antes." : "Pre-existing damage is whatever shows in the first-visit and before photos."}</p>
          <button type="button" onClick={send} disabled={state === "sending" || text.trim().length < 10 || !files.length}
            className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {state === "sending" ? (es ? "Enviando…" : "Sending…") : (es ? "Enviar reporte" : "Send report")}
          </button>
          {state === "error" && <p className="text-xs text-destructive">{es ? "No se pudo enviar. Intente de nuevo." : "Couldn't send — try again."}</p>}
        </div>
      )}
    </div>
  );
}
