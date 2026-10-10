/** Pro Schedule tab 1 — My weekly route. Five cell states; server enforces every rule. */
import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProButton } from "@/components/pro/portal/kit";
import { DAY_NAME, DAY_SHORT, HOUR_OPTIONS, SERVICE_NAME, WEEKDAYS, hhmm, hourLabel, schedError } from "@/lib/scheduling";

type Cell = {
  service: string; zip: string; weekday: number; state: "OPEN" | "MINE" | "LOCKED" | "TAKEN" | "NOT_SERVED";
  claim: null | { id: string; status: string; start: string; end: string; drop_effective: string | null; customers: number; locked_until: string | null; pending_start: string | null; hours_effective: string | null };
};
type State = { services: string[]; zips: string[]; catchup: number | null; active: boolean; cells: Cell[] };

const CELL: Record<Cell["state"], string> = {
  OPEN: "bg-white border-2 border-[hsl(var(--pro-sky)/0.7)] text-[hsl(var(--pro-blue))]",
  MINE: "bg-[hsl(var(--pro-blue))] text-white",
  LOCKED: "bg-[hsl(var(--pro-blue))] text-white ring-2 ring-[hsl(var(--pro-navy))]",
  TAKEN: "bg-[hsl(var(--pro-ink-soft)/0.18)] text-[hsl(var(--pro-ink-soft))]",
  NOT_SERVED: "text-white/80",
};
const LABEL: Record<Cell["state"], string> = { OPEN: "Open", MINE: "Mine", LOCKED: "Locked", TAKEN: "Taken", NOT_SERVED: "Not served" };
const hatch = { backgroundColor: "hsl(var(--pro-navy))", backgroundImage: "repeating-linear-gradient(45deg, hsl(var(--pro-ink) / 0.6) 0 6px, transparent 6px 12px)" };

export default function WeeklyRoute() {
  const [st, setSt] = useState<State | null>(null);
  const [sel, setSel] = useState<Cell | null>(null);
  const [start, setStart] = useState(8);
  const [end, setEnd] = useState(14);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("pro_schedule_state");
    if (error) { setMsg({ ok: false, text: schedError(error) }); return; }
    setSt(data as unknown as State);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => PromiseLike<{ data: unknown; error: unknown }>, okText: (d: any) => string) => {
    setBusy(true); setMsg(null);
    const { data, error } = await fn();
    setBusy(false);
    if (error) { setMsg({ ok: false, text: schedError(error) }); return; }
    setMsg({ ok: true, text: okText(data) }); setSel(null); setPreview(null); void load();
  };

  const pick = async (c: Cell) => {
    if (c.state === "TAKEN" || c.state === "NOT_SERVED") return;
    setSel(c); setMsg(null); setPreview(null);
    if (c.claim) {
      setStart(Number(c.claim.start.slice(0, 2))); setEnd(Number(c.claim.end.slice(0, 2)));
      const { data } = await supabase.rpc("pro_drop_preview", { _claim: c.claim.id });
      if (data) setPreview((data as { message: string }).message);
    } else { setStart(8); setEnd(14); }
  };

  if (!st) return <p className="p-4 text-[14px] text-[hsl(var(--pro-ink-soft))]">Loading your route…</p>;
  if (!st.services.length) return <p className="p-4 text-[14px] text-[hsl(var(--pro-ink-soft))]">No service on your profile yet. Tidy adds it when you're onboarded.</p>;
  const hoursOk = end - start >= 4;

  return (
    <div className="space-y-4 px-[18px] pt-4">
      <div className="rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)] bg-white p-4">
        <p className="text-[15px] font-extrabold text-[hsl(var(--pro-ink))]">Catch-up day</p>
        <p className="mt-1 text-[13px] text-[hsl(var(--pro-ink-soft))]">Your catch-up day is only used if a visit has to move. Most weeks you won't be needed.</p>
        <div className="mt-3 grid grid-cols-6 gap-1.5">
          {WEEKDAYS.map((d) => (
            <button key={d} type="button" disabled={busy}
              onClick={() => void run(() => supabase.rpc("pro_set_catchup", { _weekday: d }), () => `Catch-up day: ${DAY_NAME[d]}.`)}
              className={`min-h-[44px] rounded-lg text-[13px] font-bold ${st.catchup === d ? "bg-[hsl(var(--pro-navy))] text-white" : "border border-[hsl(var(--pro-navy)/0.12)] text-[hsl(var(--pro-ink))]"}`}>
              {DAY_SHORT[d]}
            </button>
          ))}
        </div>
        {!st.catchup && <p className="mt-2 text-[13px] font-bold text-[hsl(var(--pro-red))]">Pick a catch-up day before you claim any days.</p>}
      </div>

      {!st.active && (
        <p className="rounded-xl bg-[hsl(var(--pro-amber-soft,45_100%_92%))] p-3 text-[13px] font-semibold text-[hsl(var(--pro-ink))]">
          You're not active yet. Days you claim are pending and go live automatically once you're insured, checked and your kit is issued.
        </p>
      )}

      {st.services.map((svc) => (
        <section key={svc}>
          <h3 className="pb-2 text-[13px] font-extrabold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">{SERVICE_NAME[svc]}</h3>
          <div className="overflow-x-auto">
            <div className="grid min-w-[340px] grid-cols-[56px_repeat(6,1fr)] gap-1.5">
              <span />
              {WEEKDAYS.map((d) => <span key={d} className="text-center text-[12px] font-bold text-[hsl(var(--pro-ink-soft))]">{DAY_SHORT[d]}</span>)}
              {st.zips.map((z) => (
                <div key={z} className="contents">
                  <span className="flex items-center text-[12px] font-bold text-[hsl(var(--pro-ink))]">{z}</span>
                  {WEEKDAYS.map((d) => {
                    const c = st.cells.find((x) => x.service === svc && x.zip === z && x.weekday === d)!;
                    const tappable = c.state !== "TAKEN" && c.state !== "NOT_SERVED";
                    return (
                      <button key={d} type="button" disabled={!tappable} onClick={() => void pick(c)}
                        aria-label={`${z} ${DAY_NAME[d]}: ${LABEL[c.state]}`}
                        style={c.state === "NOT_SERVED" ? hatch : undefined}
                        className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg text-[10px] font-bold leading-tight ${CELL[c.state]} ${sel === c ? "outline outline-2 outline-[hsl(var(--pro-gold,45_95%_55%))]" : ""}`}>
                        {c.state === "LOCKED" && <Lock className="mb-0.5 h-3.5 w-3.5" aria-hidden />}
                        {LABEL[c.state]}
                        {c.claim?.status === "pending" && <span className="opacity-80">pending</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      {sel && (
        <div className="space-y-3 rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)] bg-white p-4">
          <p className="text-[16px] font-extrabold text-[hsl(var(--pro-ink))]">{SERVICE_NAME[sel.service]} · {sel.zip} · {DAY_NAME[sel.weekday]}</p>
          <div className="flex items-center gap-2 text-[14px]">
            <select className="min-h-[44px] rounded-lg border px-2" value={start} onChange={(e) => setStart(Number(e.target.value))}>
              {HOUR_OPTIONS.slice(0, -4).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
            <span>to</span>
            <select className="min-h-[44px] rounded-lg border px-2" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
              {HOUR_OPTIONS.slice(4).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
          {!hoursOk && <p className="text-[13px] text-[hsl(var(--pro-red))]">At least 4 hours.</p>}
          {!sel.claim ? (
            <ProButton full disabled={busy || !hoursOk || !st.catchup}
              onClick={() => void run(() => supabase.rpc("pro_claim_day", { _service: sel.service as never, _zip: sel.zip, _weekday: sel.weekday, _start: hhmm(start), _end: hhmm(end) }),
                (d) => d.status === "pending" ? "Claimed — pending until you're active." : "Claimed. Customers can book it now.")}>
              Claim this day
            </ProButton>
          ) : (
            <>
              {sel.claim.locked_until && <p className="text-[13px] text-[hsl(var(--pro-ink-soft))]">Customers are booked in the next 14 days. Changes take effect from {sel.claim.locked_until}.</p>}
              {sel.claim.drop_effective && <p className="text-[13px] font-semibold text-[hsl(var(--pro-red))]">Dropping — effective {sel.claim.drop_effective}.</p>}
              <ProButton full variant="secondary" disabled={busy || !hoursOk || !!sel.claim.drop_effective}
                onClick={() => void run(() => supabase.rpc("pro_update_claim_hours", { _claim: sel.claim!.id, _start: hhmm(start), _end: hhmm(end) }),
                  (d) => d.immediate ? "Hours updated." : d.message)}>
                Save hours
              </ProButton>
              {!sel.claim.drop_effective && (
                <>
                  {preview && <p className="rounded-xl bg-[hsl(var(--pro-red-soft))] p-3 text-[13px] font-semibold text-[hsl(var(--pro-red))]">{preview}</p>}
                  <ProButton full variant="secondary" disabled={busy}
                    onClick={() => { if (window.confirm(preview ?? "Drop this day?")) void run(() => supabase.rpc("pro_drop_day", { _claim: sel.claim!.id }), (d) => d.immediate ? "Day dropped." : `Drop effective ${d.effective_date}.`); }}>
                    Drop this day
                  </ProButton>
                </>
              )}
            </>
          )}
        </div>
      )}
      {msg && <p className={`rounded-xl p-3 text-[14px] font-semibold ${msg.ok ? "bg-[hsl(var(--pro-green-soft))] text-[hsl(var(--pro-green))]" : "bg-[hsl(var(--pro-red-soft))] text-[hsl(var(--pro-red))]"}`}>{msg.text}</p>}
    </div>
  );
}
