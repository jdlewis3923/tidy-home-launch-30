/**
 * Candidate self-booking — /pro/book/:token (hiring v5)
 *
 * Token-only page: book the phone screen (stage proof) or the in-person
 * interview (after phone PASS), CONFIRM the in-person slot, and reply to
 * the weekly check-in. One reschedule per kind. Location stays private.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, CalendarClock, Phone, MapPin } from "lucide-react";
import TidyLogo from "@/components/TidyLogo";
import { Input } from "@/components/ui/input";

type Slot = { id: string; starts_at: string; duration_min: number };

export default function ProBook() {
  const { token } = useParams<{ token: string }>();
  const [lang, setLang] = useState<"en" | "es">("en");
  const [stage, setStage] = useState<string>("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [kind, setKind] = useState<"phone" | "in_person">("phone");
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [checkinDone, setCheckinDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneMinutes, setPhoneMinutes] = useState(15);
  const [version, setVersion] = useState(5);
  const [reference, setReference] = useState({name: '', phone: '', relationship: ''});

  const t = useCallback((en: string, es: string) => (lang === "es" ? es : en), [lang]);
  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error: err } = await supabase.functions.invoke("hiring-candidate", { body: { token, ...payload } });
    if (err) throw err;
    return data;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await call({ action: "load" });
      if (d?.error) { setError(d.error); return; }
      setLang(d.lang === "es" ? "es" : "en");
      setStage(d.stage);
      setVersion(d.version ?? 5);
      if (d.reference) setReference({name: d.reference.name ?? '', phone: d.reference.phone ?? '', relationship: d.reference.relationship ?? ''});
      setPhoneMinutes(d.phone_duration_min === 30 ? 30 : 15);
      const k: "phone" | "in_person" = ["phone_screened", "referenced"].includes(d.stage) ? "in_person" : "phone";
      setKind(k);
      const s = await call({ action: "slots", kind: k });
      setSlots(s?.slots ?? []);
      if (s?.current) setBooked("current");
    } catch { setError("load_failed"); }
    setLoading(false);
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const book = async (slotId: string) => {
    setBooking(true); setError(null);
    try {
      const d = await call({ action: "book", kind, slot_id: slotId, ...(kind === 'in_person' && version === 6 ? { reference } : {}) });
      if (d?.ok) setBooked(d.starts_at);
      else setError(d?.error === "no_reschedules" ? t("You've already moved this once. Reply to our text and we'll help.", "Ya moviste esto una vez. Responde a nuestro mensaje y te ayudamos.") : (d?.error ?? "book_failed"));
    } catch { setError("book_failed"); }
    setBooking(false);
  };

  const confirm = async () => {
    setBooking(true);
    try { const d = await call({ action: "confirm" }); if (d?.ok) setConfirmed(true); } catch { setError("confirm_failed"); }
    setBooking(false);
  };

  const checkin = async () => {
    setBooking(true);
    try { const d = await call({ action: "checkin" }); if (d?.ok) setCheckinDone(true); } catch { setError("checkin_failed"); }
    setBooking(false);
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "es" ? "es-US" : "en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border"><div className="container mx-auto px-4 py-4 flex items-center justify-between"><TidyLogo />
        <Button variant="ghost" onClick={() => setLang(lang === "en" ? "es" : "en")}>{lang === "en" ? "Español" : "English"}</Button></div></header>
      <main className="container mx-auto px-4 py-10 max-w-xl">
        {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : (
          <>
            <div className="flex items-center gap-2 text-primary mb-3">
              {kind === "phone" ? <Phone className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
              <span className="text-sm font-semibold uppercase tracking-wide">{kind === "phone" ? t("Phone screen", "Llamada") : t("In-person interview", "Entrevista en persona")}</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {kind === "phone" ? t(`Pick a time for your ${phoneMinutes}-minute call`, `Elige el horario de tu llamada de ${phoneMinutes} minutos`) : t("Pick a time to meet in person", "Elige la hora para vernos en persona")}
            </h1>
            <p className="text-muted-foreground mb-6">
              {kind === "phone"
                ? t("Choose a weekday time. We'll call you.", "Elige un horario entre semana. Te llamaremos.")
                : t("Wednesday or Thursday, about an hour. We send the address after you confirm.", "Miércoles o jueves, alrededor de una hora. Te enviamos la dirección después de confirmar.")}
            </p>

            {["agreement", "background", "insured"].includes(stage) && !checkinDone ? (
              <div className="rounded-xl border border-border bg-card p-4 mb-6">
                <p className="font-medium text-foreground mb-3">{t("Still on for your start?", "¿Sigues listo para empezar?")}</p>
                <Button onClick={checkin} disabled={booking} className="w-full">{t("Yes, I'm in", "Sí, sigo listo")}</Button>
              </div>
            ) : null}
            {checkinDone ? <p className="text-primary font-semibold mb-6 flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />{t("Got it — see you soon.", "Listo — nos vemos pronto.")}</p> : null}
            {kind === 'in_person' && version === 6 && <section className="space-y-3 mb-6">
              <h2 className="text-lg font-semibold">{t('A work reference', 'Una referencia laboral')}</h2>
              <p className="text-sm text-muted-foreground">{t('A supervisor, coworker or client—not a family member or friend.', 'Un supervisor, compañero de trabajo o cliente; no un familiar ni un amigo.')}</p>
              <label className="block text-sm">{t('Reference name', 'Nombre de la referencia')}<Input value={reference.name} onChange={e=>setReference(r=>({...r,name:e.target.value}))}/></label>
              <label className="block text-sm">{t('Reference phone', 'Teléfono de la referencia')}<Input type="tel" value={reference.phone} onChange={e=>setReference(r=>({...r,phone:e.target.value}))}/></label>
              <label className="block text-sm">{t('Working relationship', 'Relación laboral')}<select className="w-full rounded-md border border-input bg-background p-3" value={reference.relationship} onChange={e=>setReference(r=>({...r,relationship:e.target.value}))}><option value="">{t('Select', 'Selecciona')}</option><option value="supervisor">{t('Supervisor', 'Supervisor')}</option><option value="coworker">{t('Coworker', 'Compañero de trabajo')}</option><option value="client">{t('Client', 'Cliente')}</option></select></label>
            </section>}

            {booked ? (
              <div className="rounded-xl border border-primary bg-primary/5 p-5">
                <p className="font-semibold text-foreground flex items-center gap-2 mb-1"><CalendarClock className="h-5 w-5 text-primary" />{t("You're booked", "Ya tienes hora")}</p>
                <p className="text-foreground">{booked === "current" ? t("Your time is set. Need to move it? Pick another below — you can move it once.", "Tu hora está lista. ¿Necesitas cambiarla? Elige otra abajo — puedes moverla una vez.") : fmt(booked)}</p>
                {kind === "in_person" && !confirmed ? (
                  <Button onClick={confirm} disabled={booking} className="mt-4 w-full">{t("CONFIRM — I'll be there", "CONFIRMAR — ahí estaré")}</Button>
                ) : null}
                {confirmed ? <p className="text-primary font-semibold mt-3 flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />{t("Confirmed. The address is on its way by text.", "Confirmado. La dirección va en camino por texto.")}</p> : null}
              </div>
            ) : (
              <div className="grid gap-2">
                {slots.length === 0 ? <p className="text-muted-foreground">{t("No open times right now — reply to our text and we'll find one.", "No hay horarios disponibles ahora — responde a nuestro mensaje y encontramos uno.")}</p>
                  : slots.map((s) => (
                    <Button key={s.id} variant="outline" size="lg" disabled={booking || (kind === 'in_person' && version === 6 && (!reference.name.trim() || reference.phone.replace(/\D/g,'').length < 10 || !reference.relationship))} onClick={() => book(s.id)} className="justify-start h-12">
                      {fmt(s.starts_at)}
                    </Button>
                  ))}
              </div>
            )}
            {error ? <p className="text-destructive text-sm mt-4">{error}</p> : null}
          </>
        )}
      </main>
    </div>
  );
}
