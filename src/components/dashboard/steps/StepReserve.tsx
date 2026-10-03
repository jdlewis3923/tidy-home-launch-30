import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ConfigState, calculatePricing, sizeFor, VALID_ZIPS, clearState } from '@/lib/dashboard-pricing';
import { LAUNCH_DATE_LONG, RESERVATION_SERVICE_LABEL, RESERVABLE_SERVICES, type ReservableService } from '@/lib/launch';
import { useFoundingCounts, isFull } from '@/hooks/useFoundingCounts';
import FoundingCounter from '@/components/FoundingCounter';
import { useLanguage } from '@/contexts/LanguageContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Any day'];
const HEARD = [
  ['door_hanger', 'Door hanger'], ['nextdoor', 'Nextdoor'], ['google', 'Google'], ['referral', 'Referral'], ['other', 'Other'],
] as const;

const input = 'w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10';
const label = 'text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint';

export const RESERVE_RESULT_KEY = 'tidy_reservation_result';

export default function StepReserve({ state, onChange }: { state: ConfigState; onChange: (s: ConfigState) => void }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: counts } = useFoundingCounts();
  const [heard, setHeard] = useState('');
  const [heardOther, setHeardOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof ConfigState, v: unknown) => onChange({ ...state, [k]: v });

  const services = state.services.filter((s): s is ReservableService => (RESERVABLE_SERVICES as readonly string[]).includes(s));
  const allFull = services.length > 0 && services.every((s) => isFull(counts, s));
  const zipOk = VALID_ZIPS.includes(state.zip);
  const ready = !!(state.firstName.trim() && /\S+@\S+\.\S+/.test(state.email) && state.phone.replace(/\D/g, '').length >= 10
    && state.address.trim().length >= 3 && zipOk && state.preferredDay && state.preferredTime && heard && services.length);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr(null);
    const pricing = calculatePricing(state);
    const lines = pricing.servicePrices.map((sp) => ({
      service: sp.service, size: (sizeFor(state, sp.service) ?? null) as number | string | null,
      cadence: state.frequencies[sp.service] ?? null, monthly: sp.price, visits_per_month: sp.visitsPerMonth,
    }));
    const { password: _p, ...quote } = state;
    const { data, error } = await supabase.functions.invoke('reservation-submit', {
      body: {
        first_name: state.firstName.trim(), last_name: state.lastName.trim(), email: state.email.trim(), phone: state.phone.trim(),
        sms_consent: state.smsConsent, services, lines, quote,
        street: state.address.trim(), city: state.city.trim(), zip: state.zip, preferred_day: state.preferredDay,
        preferred_time: state.preferredTime, heard_from: heard, heard_other: heardOther || undefined, lang: language === 'es' ? 'es' : 'en',
      },
    });
    setBusy(false);
    if (error || !data?.ok) { setErr(t("That didn't go through. Please try again, or call (786) 829-1141.")); return; }
    try { sessionStorage.setItem(RESERVE_RESULT_KEY, JSON.stringify({ first: state.firstName.trim(), services, waitlist: data.waitlist ?? [] })); } catch { /* ignore */ }
    qc.invalidateQueries({ queryKey: ['founding-spot-counts'] });
    clearState();
    navigate('/reserved');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-hairline bg-white p-5 text-sm text-ink-soft space-y-2" data-testid="reserve-framing">
        <p>{t(`No card today, nothing to pay now. We'll confirm your day and time before service begins on ${LAUNCH_DATE_LONG}.`)}</p>
        <p className="font-semibold text-ink">{t('Founding members pick their day first — the earlier you reserve, the better your choice of day and time.')}</p>
        <div className="pt-1"><FoundingCounter services={services.length ? services : undefined} /></div>
        {services.filter((s) => isFull(counts, s)).map((s) => (
          <p key={s} className="text-xs text-ink">{t(`The founding group for ${RESERVATION_SERVICE_LABEL[s]} is full — you'll join the waitlist for it.`)}</p>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5"><label className={label}>{t('first name')} *</label><input className={input} autoComplete="given-name" value={state.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
        <div className="space-y-1.5"><label className={label}>{t('last name')}</label><input className={input} autoComplete="family-name" value={state.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
        <div className="space-y-1.5"><label className={label}>{t('email')} *</label><input className={input} type="email" autoComplete="email" value={state.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div className="space-y-1.5"><label className={label}>{t('mobile')} *</label><input className={input} type="tel" autoComplete="tel" value={state.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div className="space-y-1.5 md:col-span-2"><label className={label}>{t('street address')} *</label><input className={input} autoComplete="street-address" value={state.address} onChange={(e) => set('address', e.target.value)} /></div>
        <div className="space-y-1.5"><label className={label}>ZIP *</label><input className={input} inputMode="numeric" maxLength={5} value={state.zip} onChange={(e) => set('zip', e.target.value.replace(/\D/g, ''))} />
          {state.zip.length === 5 && !zipOk && <p className="text-[11px] text-destructive">{t('We serve 33156, 33183 and 33186 for now.')}</p>}</div>
        <div className="space-y-1.5"><label className={label}>{t('preferred day')} *</label>
          <select className={input} value={state.preferredDay} onChange={(e) => set('preferredDay', e.target.value)}>
            <option value="">{t('Pick a day')}</option>{DAYS.map((d) => <option key={d} value={d}>{t(d)}</option>)}
          </select></div>
      </div>

      <div className="space-y-1.5">
        <span className={label}>{t('morning or afternoon')} *</span>
        <div className="grid grid-cols-2 gap-2">
          {(['morning', 'afternoon'] as const).map((v) => (
            <button key={v} type="button" onClick={() => set('preferredTime', v)} aria-pressed={state.preferredTime === v}
              className={`rounded-lg border px-4 py-3 text-sm font-semibold ${state.preferredTime === v ? 'border-ink bg-ink text-primary-foreground' : 'border-hairline bg-white text-ink'}`}>
              {t(v === 'morning' ? 'Morning' : 'Afternoon')}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className={label}>{t('how did you hear about us?')} *</span>
        <div className="flex flex-wrap gap-2">
          {HEARD.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setHeard(v)} aria-pressed={heard === v}
              className={`rounded-full border px-3.5 py-2 text-xs font-semibold ${heard === v ? 'border-ink bg-ink text-primary-foreground' : 'border-hairline bg-white text-ink'}`}>{t(l)}</button>
          ))}
        </div>
        {heard === 'other' && <input className={input} placeholder={t('Tell us where')} value={heardOther} onChange={(e) => setHeardOther(e.target.value)} />}
      </div>

      <label className="flex items-start gap-2 text-[11px] text-ink-faint">
        <input type="checkbox" className="mt-0.5" checked={state.smsConsent} onChange={(e) => set('smsConsent', e.target.checked)} />
        <span>{t('Text me my reservation confirmation and schedule updates from Tidy Home Concierge. Msg & data rates may apply. Reply STOP to opt out.')}</span>
      </label>

      {err && <p className="text-sm text-destructive">{err}</p>}
      <button type="button" onClick={submit} disabled={!ready || busy} data-testid="reserve-submit"
        className="w-full rounded-xl bg-ink px-7 py-4 text-sm font-semibold text-primary-foreground shadow-[0_12px_32px_-10px_hsl(var(--ink)/0.55)] disabled:opacity-40">
        {busy ? t('Reserving…') : allFull ? t('Join the waitlist') : t('Reserve your spot')}
      </button>
    </div>
  );
}
