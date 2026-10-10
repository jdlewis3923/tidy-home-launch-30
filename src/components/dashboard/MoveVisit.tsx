/** Move one visit: any date within 7 days either side, 48+ hours' notice, only where the same Pro works. Server decides. */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { addDays, schedError } from "@/lib/scheduling";

export default function MoveVisit({ visitId, visitDate }: { visitId: string; visitDate: string }) {
  const { language } = useLanguage();
  const es = language === "es";
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("customer_move_visit", { _visit: visitId, _date: date });
    setBusy(false);
    if (error) { setMsg(schedError(error)); return; }
    setMsg(es ? "Visita movida." : "Visit moved."); setTimeout(() => window.location.reload(), 800);
  };
  if (!open) return <button type="button" className="text-[11px] font-semibold text-[hsl(var(--primary))]" onClick={() => setOpen(true)}>{es ? "Mover esta visita" : "Move this visit"}</button>;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <input type="date" min={addDays(visitDate, -7)} max={addDays(visitDate, 7)} value={date} onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-[hsl(var(--hairline))] px-2 py-1 text-sm" />
      <button type="button" disabled={!date || busy} onClick={() => void submit()} className="rounded-lg bg-[hsl(var(--primary))] px-3 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50">
        {es ? "Mover" : "Move"}
      </button>
      {msg && <p className="w-full text-[11px] text-ink-soft">{msg}</p>}
    </div>
  );
}
