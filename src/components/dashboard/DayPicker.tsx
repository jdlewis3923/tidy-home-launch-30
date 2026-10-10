/**
 * Customer day picker (Layer 3). Shows only weekdays with an ACTIVE Pro claim in
 * the member's ZIP; full days are greyed with a per-day waitlist. Windows,
 * first visit date and the Pro's name all come from the server.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { DAY_NAME, DAY_NAME_ES, SERVICE_NAME, SERVICE_NAME_ES, prettyDay, schedError, type SchedService } from "@/lib/scheduling";

type Win = { key: string; label: string; first_date: string };
type Opt = { weekday: number; day: string; pro_first_name: string; full: boolean; windows: Win[] };
type Options = {
  error?: string; zip: string; cadence: string; options: Opt[];
  booking: null | { weekday: number; window: string; first_visit_date: string; pro_first_name: string; losing_day: string | null };
  waitlist: { kind: string; weekday: number | null; status: string; offer_weekday: number | null; hold_until: string | null }[];
};

const T = {
  en: {
    title: (s: string) => `Your ${s} day`, choose: "Choose your day", change: "Change day", lawnCard: (d: string) => `Done ${d} by 6 pm. You don't need to be home.`,
    full: (d: string) => `${d} — full. Join the list for ${d}.`, none: "No days are open in your area yet.", joinZip: "Join the waitlist for your ZIP",
    onList: "You're on the list. We'll offer the next opening and hold it 48 hours.", window: "Pick a window", entry: "How do we get in?",
    entries: { home: "I'll be home", lockbox: "Lockbox", code: "Door code", key: "Key left for us" }, gate: "Gate code", gateLoc: "Where is the gate?",
    vehicle: "Vehicle (color, make, model)", parking: "Where is it parked?", interior: "Interior access", confirm: "Confirm",
    summary: (s: string, d: string, w: string, c: string, f: string) => `${s} · every ${d} · ${w} · ${c} · first visit ${f}`, pro: (n: string) => `Your Pro is ${n}.`,
    booked: (d: string, w: string, f: string, n: string) => `${d}${w ? `, ${w}` : ""}. First visit ${f}. Your Pro is ${n}.`,
    losing: (d: string) => `Your day changes from ${d}. Choose another day below.`, offer: (d: string) => `${d} opened for you — held 48 hours.`,
    notice: "Changing your day needs 48 hours' notice.", cancel: "Cancel",
  },
  es: {
    title: (s: string) => `Tu día de ${s}`, choose: "Elige tu día", change: "Cambiar día", lawnCard: (d: string) => `Listo el ${d} antes de las 6 pm. No necesitas estar en casa.`,
    full: (d: string) => `${d} — lleno. Únete a la lista del ${d}.`, none: "Aún no hay días disponibles en tu zona.", joinZip: "Únete a la lista de espera de tu código postal",
    onList: "Estás en la lista. Te ofreceremos el próximo espacio y lo reservaremos 48 horas.", window: "Elige un horario", entry: "¿Cómo entramos?",
    entries: { home: "Estaré en casa", lockbox: "Caja de llaves", code: "Código de puerta", key: "Nos dejas una llave" }, gate: "Código del portón", gateLoc: "¿Dónde está el portón?",
    vehicle: "Vehículo (color, marca, modelo)", parking: "¿Dónde está estacionado?", interior: "Acceso al interior", confirm: "Confirmar",
    summary: (s: string, d: string, w: string, c: string, f: string) => `${s} · cada ${d} · ${w} · ${c} · primera visita ${f}`, pro: (n: string) => `Tu Pro es ${n}.`,
    booked: (d: string, w: string, f: string, n: string) => `${d}${w ? `, ${w}` : ""}. Primera visita ${f}. Tu Pro es ${n}.`,
    losing: (d: string) => `Tu día cambia a partir del ${d}. Elige otro día abajo.`, offer: (d: string) => `Se abrió el ${d} para ti — reservado 48 horas.`,
    notice: "Cambiar tu día requiere 48 horas de aviso.", cancel: "Cancelar",
  },
};
const CADENCE_ES: Record<string, string> = { weekly: "semanal", biweekly: "cada dos semanas", monthly: "mensual" };

export default function DayPicker({ service }: { service: SchedService }) {
  const { language } = useLanguage();
  const lang = language === "es" ? "es" : "en";
  const L = T[lang];
  const dayName = (n: number) => (lang === "es" ? DAY_NAME_ES : DAY_NAME)[n];
  const svc = (lang === "es" ? SERVICE_NAME_ES : SERVICE_NAME)[service];
  const [o, setO] = useState<Options | null>(null);
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState<Opt | null>(null);
  const [win, setWin] = useState<Win | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("customer_day_options", { _service: service });
    if (error) { setErr(schedError(error)); return; }
    setO(data as unknown as Options);
  }, [service]);
  useEffect(() => { void load(); }, [load]);

  if (!o || o.error) return null;
  const pickDay = (opt: Opt) => { setDay(opt); setWin(service === "lawn" ? opt.windows[0] : null); setErr(null); };
  const join = async (weekday: number | null) => {
    const { error } = await supabase.rpc("customer_join_waitlist", { _service: service, _weekday: weekday ?? undefined });
    if (error) setErr(schedError(error)); else void load();
  };
  const book = async () => {
    if (!day || !win) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("customer_book_day", { _service: service, _weekday: day.weekday, _window: win.key, _details: details });
    setBusy(false);
    if (error) { setErr(schedError(error)); return; }
    setEditing(false); setDay(null); setWin(null); void load();
  };
  const field = (k: string, label: string) => (
    <label className="block text-sm"><span className="font-semibold text-ink">{label}</span>
      <input className="mt-1 w-full rounded-xl border border-[hsl(var(--hairline))] bg-white px-3 py-2 text-base" value={details[k] ?? ""} maxLength={200}
        onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />
    </label>
  );
  const offered = o.waitlist.find((w) => w.status === "offered");
  const showPicker = !o.booking || editing || !!o.booking.losing_day;
  const entryOk = service !== "cleaning" || !!details.entry_method;

  return (
    <div className="rounded-3xl border border-[hsl(var(--hairline))] bg-white p-6">
      <h2 className="text-lg font-bold text-ink">{L.title(svc.toLowerCase())}</h2>
      {o.booking && (
        <p className="mt-1 text-sm text-ink-soft">
          {L.booked(dayName(o.booking.weekday), o.booking.window === "day" ? "" : o.booking.window, prettyDay(o.booking.first_visit_date, lang), o.booking.pro_first_name)}
        </p>
      )}
      {o.booking?.losing_day && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{L.losing(prettyDay(o.booking.losing_day, lang))}</p>}
      {offered?.offer_weekday && <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{L.offer(dayName(offered.offer_weekday))}</p>}
      {o.booking && !editing && !o.booking.losing_day && (
        <button type="button" className="mt-3 text-sm font-semibold text-[hsl(var(--primary))]" onClick={() => setEditing(true)}>{L.change}</button>
      )}

      {showPicker && (
        <div className="mt-4 space-y-4">
          {o.booking && <p className="text-xs text-ink-soft">{L.notice}</p>}
          {o.options.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-ink-soft">{L.none}</p>
              {o.waitlist.some((w) => w.kind === "zip") ? <p className="text-sm font-semibold text-ink">{L.onList}</p> :
                <button type="button" className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-bold text-primary-foreground" onClick={() => void join(null)}>{L.joinZip}</button>}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {o.options.map((opt) => {
                const listed = o.waitlist.some((w) => w.weekday === opt.weekday);
                if (opt.full) return (
                  <button key={opt.weekday} type="button" disabled={listed} onClick={() => void join(opt.weekday)}
                    className="rounded-2xl border border-[hsl(var(--hairline))] bg-cream/60 p-4 text-left text-sm text-ink-faint">
                    {listed ? `${dayName(opt.weekday)} — ${L.onList}` : L.full(dayName(opt.weekday))}
                  </button>
                );
                return (
                  <button key={opt.weekday} type="button" onClick={() => pickDay(opt)}
                    className={`rounded-2xl border p-4 text-left ${day?.weekday === opt.weekday ? "border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary)/0.3)]" : "border-[hsl(var(--hairline))]"}`}>
                    <p className="text-base font-bold text-ink">{dayName(opt.weekday)}</p>
                    {service === "lawn" && <p className="mt-1 text-sm text-ink-soft">{L.lawnCard(dayName(opt.weekday))}</p>}
                  </button>
                );
              })}
            </div>
          )}

          {day && service !== "lawn" && (
            <div>
              <p className="text-sm font-semibold text-ink">{L.window}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {day.windows.map((w) => (
                  <button key={w.key} type="button" onClick={() => setWin(w)}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold ${win?.key === w.key ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-primary-foreground" : "border-[hsl(var(--hairline))] text-ink"}`}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {day && win && (
            <div className="space-y-3">
              {service === "lawn" && <>{field("gate_code", L.gate)}{field("gate_location", L.gateLoc)}</>}
              {service === "cleaning" && (
                <div>
                  <p className="text-sm font-semibold text-ink">{L.entry}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(Object.keys(L.entries) as (keyof typeof L.entries)[]).map((k) => (
                      <button key={k} type="button" onClick={() => setDetails({ ...details, entry_method: k })}
                        className={`rounded-xl border px-3 py-2 text-sm ${details.entry_method === k ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-primary-foreground" : "border-[hsl(var(--hairline))] text-ink"}`}>
                        {L.entries[k]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {service === "detailing" && <>{field("vehicle", L.vehicle)}{field("parking_spot", L.parking)}{field("interior_access", L.interior)}</>}
              <div className="rounded-2xl bg-cream/60 p-4 text-sm text-ink">
                <p>{L.summary(svc, dayName(day.weekday), win.label, lang === "es" ? CADENCE_ES[o.cadence] ?? o.cadence : o.cadence, prettyDay(win.first_date, lang))}</p>
                <p className="mt-1 font-bold">{L.pro(day.pro_first_name)}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy || !entryOk} onClick={() => void book()}
                  className="rounded-xl bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{L.confirm}</button>
                {o.booking && <button type="button" className="text-sm text-ink-soft" onClick={() => { setEditing(false); setDay(null); }}>{L.cancel}</button>}
              </div>
            </div>
          )}
        </div>
      )}
      {err && <p className="mt-3 text-sm font-semibold text-destructive">{err}</p>}
    </div>
  );
}
