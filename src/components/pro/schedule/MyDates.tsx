/** Pro Schedule tab 2 — My dates: next 8 weeks. Inside 14 days = call-off; 14+ days = time off. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProButton } from "@/components/pro/portal/kit";
import { DAY_SHORT, addDays, parseDay, prettyDay, schedError } from "@/lib/scheduling";

type Dates = {
  today: string; until: string; lock_until: string; catchup: number | null;
  visits: { date: string; count: number }[]; off: { date: string; kind: string }[]; blackouts: { date: string; label: string }[];
};

export default function MyDates() {
  const [d, setD] = useState<Dates | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("pro_dates", { _weeks: 8 });
    if (error) { setMsg({ ok: false, text: schedError(error) }); return; }
    setD(data as unknown as Dates);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const weeks = useMemo(() => {
    if (!d) return [];
    const t = parseDay(d.today);
    const monday = addDays(d.today, -((t.getDay() + 6) % 7));
    return Array.from({ length: 8 }, (_, w) => Array.from({ length: 6 }, (_, i) => addDays(monday, w * 7 + i)));
  }, [d]);

  if (!d) return <p className="p-4 text-[14px] text-[hsl(var(--pro-ink-soft))]">Loading your dates…</p>;
  const inLock = (iso: string) => iso < d.lock_until;
  const markOff = async () => {
    if (!sel) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("pro_mark_off", { _date: sel });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: schedError(error) }); return; }
    const r = data as { kind: string; moved: number; queued: number };
    setMsg({ ok: true, text: `${r.kind === "call_off" ? "Call-off recorded" : "Time off approved"}. ${r.moved} visit${r.moved === 1 ? "" : "s"} moved${r.queued ? `, ${r.queued} with Tidy to place` : ""}.` });
    setSel(null); void load();
  };

  return (
    <div className="space-y-4 px-[18px] pt-4">
      <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-[hsl(var(--pro-ink-soft))]">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-[hsl(var(--pro-blue))]" />Booked</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded border-2 border-dashed border-[hsl(var(--pro-blue))]" />Catch-up</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-[hsl(var(--pro-red))]" />Off</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-[hsl(var(--pro-navy))]" />Holiday</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {[1, 2, 3, 4, 5, 6].map((w) => <span key={w} className="text-center text-[12px] font-bold text-[hsl(var(--pro-ink-soft))]">{DAY_SHORT[w]}</span>)}
        {weeks.flat().map((iso) => {
          const past = iso < d.today;
          const v = d.visits.find((x) => x.date === iso);
          const off = d.off.find((x) => x.date === iso);
          const hol = d.blackouts.find((x) => x.date === iso);
          const cu = d.catchup === ((parseDay(iso).getDay() + 6) % 7) + 1;
          const tone = hol ? "bg-[hsl(var(--pro-navy))] text-white" : off ? "bg-[hsl(var(--pro-red))] text-white" : v ? "bg-[hsl(var(--pro-blue))] text-white" : "bg-white text-[hsl(var(--pro-ink))]";
          return (
            <button key={iso} type="button" disabled={past || !!off || !!hol} onClick={() => { setSel(iso); setMsg(null); }}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg border text-[12px] font-bold ${tone} ${cu && !off && !hol ? "border-2 border-dashed border-[hsl(var(--pro-blue))]" : "border-[hsl(var(--pro-navy)/0.08)]"} ${past ? "opacity-40" : ""} ${sel === iso ? "outline outline-2 outline-[hsl(var(--pro-navy))]" : ""}`}>
              {parseDay(iso).getDate()}
              {v && <span className="text-[10px]">{v.count} visit{v.count === 1 ? "" : "s"}</span>}
              {off && <span className="text-[10px]">off</span>}
              {hol && <span className="text-[10px]">closed</span>}
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="space-y-2 rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)] bg-white p-4">
          <p className="text-[15px] font-extrabold text-[hsl(var(--pro-ink))]">{prettyDay(sel)}</p>
          <p className="text-[13px] text-[hsl(var(--pro-ink-soft))]">
            {inLock(sel)
              ? "This is inside 14 days. Calling off moves your customers to your catch-up day or another day you work, and is counted."
              : "Planned time off. Your customers are moved well ahead. Not counted against you."}
          </p>
          <ProButton full disabled={busy} onClick={() => { if (window.confirm(inLock(sel) ? "I can't work this day?" : "Request this day off?")) void markOff(); }}>
            {inLock(sel) ? "I can't work this day" : "Request this day off"}
          </ProButton>
        </div>
      )}
      {msg && <p className={`rounded-xl p-3 text-[14px] font-semibold ${msg.ok ? "bg-[hsl(var(--pro-green-soft))] text-[hsl(var(--pro-green))]" : "bg-[hsl(var(--pro-red-soft))] text-[hsl(var(--pro-red))]"}`}>{msg.text}</p>}
    </div>
  );
}
