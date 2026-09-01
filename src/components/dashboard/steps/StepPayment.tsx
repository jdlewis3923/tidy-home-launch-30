import { useState, useEffect, useMemo } from 'react';
import { Lock, ShieldCheck, CreditCard, BadgeCheck, Banknote, X as XIcon } from 'lucide-react';
import {
  ConfigState,
  calculatePricing,
  serviceLabels,
  serviceIcons,
  frequencyLabels,
  addOnData,
  hasCustomQuote,
  sizeLabels,
  sizeFor,
  serviceUnits,
  frequencyVisitCopy,
  formatPerVisit,
  formatMonthly,
} from '@/lib/dashboard-pricing';
import { startCheckout, translate } from '@/lib/checkout';
import { useLanguage } from '@/contexts/LanguageContext';
import { provisionAccount } from '@/lib/account-provisioning';
import { STRIPE_INTEGRATION_ENABLED } from '@/lib/dashboard-config';
import { supabase } from '@/integrations/supabase/client';
import { getStripe, isEmbeddedCheckoutAvailable } from '@/lib/stripe-client';
import EmbeddedPaymentForm from '@/components/dashboard/EmbeddedPaymentForm';
import { getLandingSource, getQrPlacement, getQrRoute, getQrZip } from "@/lib/landing-source";
import { getUtmAttribution } from '@/lib/utm';

// The exact Terms wording shown next to the pay button. It is both rendered and
// stored with the recorded consent, so change them together.
const CHECKOUT_TERMS_WORDING =
  "By subscribing, you agree to Tidy's Terms of Service and Privacy Policy.";

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

/**
 * Calm "you're all set" payment moment. Cream paper, ink type, soft
 * shadows. Only the CTA carries weight. Designed to feel like signing
 * off — not checkout.
 */
export default function StepPayment({ state, onChange }: Props) {
  const { language } = useLanguage();
  const pricing = calculatePricing(state);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const customQuote = hasCustomQuote(state);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const totalToday = pricing.firstMonth;

  const embedded = isEmbeddedCheckoutAvailable();
  const stripePromise = useMemo(() => (embedded ? getStripe() : null), [embedded]);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  // The server contract lives in src/lib/checkout.ts — one translator for both
  // the hosted and embedded paths, so sizes and cadence can't drift apart.
  const buildIntentBody = () => {
    const { services, addons, car_wash } = translate(state);
    const attr = getUtmAttribution();
    return {
      services, addons, car_wash,
      referral_code: state.referralCode?.trim() || undefined,
      zip: state.zip, preferred_day: state.preferredDay, preferred_time: state.preferredTime,
      lang: language,
      idempotency_key: `cfg:${state.zip}:${services.map(s => `${s.service}:${s.size}:${s.frequency}`).sort().join(',')}:${addons.map(a => a.addon_name + 'x' + a.qty).sort().join(',')}`,
      gclid: attr.gclid, utm_source: attr.utm_source, utm_medium: attr.utm_medium,
      utm_campaign: attr.utm_campaign, utm_content: attr.utm_content, utm_term: attr.utm_term,
      // Door-hanger split: which side of the print run this signup came through.
      landing_source: getLandingSource() ?? undefined,
      qr_placement: getQrPlacement() ?? undefined,
      qr_zip: getQrZip() ?? undefined,
      qr_route: getQrRoute() ?? undefined,
    };
  };

  const handlePay = async () => {
    if (customQuote || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await provisionAccount(state);
      if (result.ok === false) {
        setError(result.message);
        setSubmitting(false);
        return;
      }
      // TCPA: store the exact SMS wording the customer saw, plus whether they
      // opted in. Recorded for both outcomes so a "no" is provable too.
      {
        const { recordConsent, SMS_CONSENT_VERSION, SMS_CONSENT_WORDING, TERMS_VERSION } =
          await import('@/lib/consent');
        void recordConsent({
          kind: 'sms',
          version: SMS_CONSENT_VERSION,
          wording: SMS_CONSENT_WORDING,
          granted: state.smsConsent === true,
          email: state.email || undefined,
        });
        // Terms assent: subscribing is the affirmative act, so it is recorded
        // with the exact wording shown next to the pay button (timestamp,
        // version and IP are stamped server-side by record-consent).
        void recordConsent({
          kind: 'terms',
          version: TERMS_VERSION,
          wording: CHECKOUT_TERMS_WORDING,
          granted: true,
          email: state.email || undefined,
        });
      }

      if (STRIPE_INTEGRATION_ENABLED && embedded) {
        // Embedded path — fetch client_secret then mount Payment Element.
        setPreparing(true);
        const { data, error: fnErr } = await supabase.functions.invoke('create-stripe-payment-intent', {
          body: buildIntentBody(),
        });
        setPreparing(false);
        if (fnErr || !data?.ok || !data?.client_secret) {
          setError(data?.error ?? fnErr?.message ?? 'could not start checkout.');
          setSubmitting(false);
          return;
        }
        setClientSecret(data.client_secret as string);
        // Keep submitting=true until the user finishes paying (UI shows form, no double-submit possible).
      } else {
        // Hosted-checkout path — always reachable, regardless of any flag state.
        await startCheckout({ config: state, lang: language });
        // startCheckout redirects; clear the flag as a safety net so the button
        // can never stay stuck if the redirect does not happen.
        setSubmitting(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'checkout failed. please try again.');
      setPreparing(false);
      setSubmitting(false);
    }
  };

  const reveal = (delay: number) =>
    `transition-all duration-700 ease-out ${
      mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
    }`;

  return (
    <div className="space-y-5">
      {/* Calm summary card */}
      <div
        className={`rounded-2xl border border-hairline bg-white p-6 shadow-[0_8px_32px_-16px_hsl(var(--ink)/0.18)] ${reveal(0)}`}
        style={{ transitionDelay: '40ms' }}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">monthly plan</p>

        <div className="mt-4 space-y-2 text-sm">
          {pricing.servicePrices.map((sp, idx) => {
            const size = sizeFor(state, sp.service);
            const freq = state.frequencies[sp.service]!;
            const quoted = size === 'quote' || !size;
            return (
              <div
                key={sp.service}
                className={`flex justify-between items-baseline gap-3 ${reveal(0)}`}
                style={{ transitionDelay: `${120 + idx * 60}ms` }}
              >
                <span className="text-ink">
                  <span className="mr-1.5">{serviceIcons[sp.service]}</span>
                  <span className="font-semibold lowercase">{serviceLabels[sp.service]}</span>
                  <span className="text-ink-faint ml-1.5 text-xs lowercase">
                    — {!quoted ? `${sizeLabels[sp.service][size as 1 | 2 | 3].toLowerCase()} · ` : ''}
                    {serviceUnits[sp.service] === 'per_month' ? 'monthly' : frequencyLabels[freq].toLowerCase()}
                  </span>
                </span>
                <span className="text-right">
                  <span className="font-semibold text-ink tabular-nums block">
                    {quoted ? 'quote' : `$${sp.price.toFixed(2)}`}
                  </span>
                  {!quoted && sp.sticker > 0 && (
                    <span className="text-[10px] text-ink-faint block lowercase">
                      {serviceUnits[sp.service] === 'per_month'
                        ? formatMonthly(sp.sticker)
                        : `${formatPerVisit(sp.sticker)} · ${frequencyVisitCopy[freq]}`}
                    </span>
                  )}
                </span>
              </div>
            );
          })}

          {pricing.carWashSubtotal > 0 && (
            <div className="flex justify-between items-baseline gap-3 text-ink-soft text-xs">
              <span>+ Car Wash Add-On</span>
              <span className="tabular-nums">${pricing.carWashSubtotal.toFixed(2)}</span>
            </div>
          )}

          {pricing.freeAddons > 0 && (
            <div className="flex justify-between items-baseline gap-3 text-ink">
              <span className="text-xs lowercase">1 free premium add-on a month — your pick</span>
              <span className="text-xs tabular-nums">included</span>
            </div>
          )}

          {state.addOns.map(id => {
            const addon = addOnData[id];
            if (!addon) return null;
            return (
              <div key={id} className="flex justify-between items-baseline gap-3 text-ink-soft text-xs">
                <span>+ {addon.name}</span>
                <span className="tabular-nums">${addon.price.toFixed(2)}</span>
              </div>
            );
          })}

          {pricing.taxTriggered && (
            <div className="flex justify-between items-baseline gap-3 text-ink-soft">
              <span className="text-xs">FL sales tax ({pricing.taxPercentage}%, coating applied)</span>
              <span className="text-xs tabular-nums">${pricing.taxAmount.toFixed(2)}</span>
            </div>
          )}
        </div>


        <div className="my-5 h-px bg-hairline" />

        <div className="flex justify-between items-end">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">total today</p>
            {!customQuote && (
              <p className="text-[11px] text-ink-faint mt-1">
                then <span className="font-semibold text-ink-soft tabular-nums">${pricing.ongoing.toFixed(2)}</span>/mo · cancel anytime
              </p>
            )}
          </div>
          <div className="text-right">
            {customQuote ? (
              <span className="text-2xl font-bold text-ink tracking-tight">custom</span>
            ) : (
              <>
                <div className="text-4xl font-bold text-ink tabular-nums tracking-tight">
                  ${totalToday.toFixed(2)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 24-Hour Re-do Guarantee — prominent near price summary. */}
      <div
        className={`flex items-center gap-3 rounded-xl border-2 border-gold/40 bg-gold/10 px-4 py-3 ${reveal(0)}`}
        style={{ transitionDelay: '180ms' }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/20 ring-1 ring-gold/50">
          <BadgeCheck className="h-5 w-5 text-gold" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-ink leading-tight">24-hour Re-do Guarantee</p>
          <p className="text-[11px] text-ink-soft mt-0.5 leading-snug">
            Not happy? We make it right within 24 hours.
          </p>
        </div>
      </div>

      {/* Pre-checkout trust badge row — vetted / background-checked / cancel anytime. */}
      <div
        className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${reveal(0)}`}
        style={{ transitionDelay: '220ms' }}
      >
        {[
          { icon: Banknote,    label: 'Vetted' },
          { icon: ShieldCheck, label: 'Photo Verified' },
          { icon: BadgeCheck,  label: 'Background Checked' },
          { icon: XIcon,       label: 'Cancel Anytime' },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-hairline bg-white px-2 py-2.5 text-center"
          >
            <Icon className="h-3.5 w-3.5 text-ink-soft" strokeWidth={2} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Payment-security trust strip (encrypted / pci / stripe). */}
      <div
        className={`grid grid-cols-3 gap-2 ${reveal(0)}`}
        style={{ transitionDelay: '260ms' }}
      >
        {[
          { icon: Lock, label: 'encrypted' },
          { icon: ShieldCheck, label: 'pci compliant' },
          { icon: CreditCard, label: 'stripe' },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-hairline bg-white px-2 py-2.5 text-center"
          >
            <Icon className="h-3.5 w-3.5 text-ink-faint" strokeWidth={2} />
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Consent block */}
      <div
        className={`space-y-3 rounded-xl border border-hairline bg-white/70 p-4 ${reveal(0)}`}
        style={{ transitionDelay: '280ms' }}
      >
        <p className="text-[11px] leading-relaxed text-ink-soft">
          by paying, you're creating your tidy account. we'll email your login link so you can manage,
          pause, or cancel anytime.
        </p>

        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={state.smsConsent === true}
            onChange={e => onChange({ ...state, smsConsent: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-hairline text-ink accent-ink"
          />
          <span className="text-[11px] leading-relaxed text-ink-soft group-hover:text-ink transition-colors">
            i agree to receive recurring automated sms messages from tidy home concierge llc at the
            phone number i provided. msg &amp; data rates may apply. reply stop to opt out.
          </span>
        </label>

        {/* Terms assent — this exact wording is stored via recordConsent('terms'). */}
        <p className="text-[11px] leading-relaxed text-ink-faint">
          by subscribing, you agree to tidy's{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:underline">
            terms of service
          </a>{' '}
          and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:underline">
            privacy policy
          </a>
          .
        </p>

        {/* Founding-offer terms — small print, no counters or spot numbers. */}
        <div className="border-t border-hairline pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            founding offer terms
          </p>
          <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-ink-faint">
            <li>· founding rate locked — your price never rises.</li>
            <li>· one free premium add-on on your first visit.</li>
            <li>· first visit perfect or it's free.</li>
            <li>· only 25 founding homes per zip code.</li>
            <li>· in exchange for a review after your second visit.</li>
          </ul>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive animate-calm-in">
          {error}
        </div>
      )}

      {/* Embedded Payment Element (mounts after we have a client_secret). */}
      {clientSecret && stripePromise ? (
        <EmbeddedPaymentForm
          stripe={stripePromise}
          clientSecret={clientSecret}
          returnUrl={`${window.location.origin}/welcome`}
          onError={(msg) => { setError(msg); setSubmitting(false); }}
        />
      ) : (
        /* Calm CTA — navy ink, white text, soft lift */
        <button
          type="button"
          onClick={handlePay}
          disabled={submitting || customQuote || preparing}
          className={`group relative w-full overflow-hidden rounded-xl bg-ink px-6 py-5 text-base font-semibold text-white shadow-[0_14px_40px_-12px_hsl(var(--ink)/0.5)] transition-all duration-300 hover:shadow-[0_22px_48px_-12px_hsl(var(--ink)/0.6)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${reveal(0)}`}
          style={{ transitionDelay: '340ms', letterSpacing: '-0.005em' }}
        >
          <span className="relative inline-flex items-center justify-center gap-2 lowercase">
            {submitting || preparing ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {embedded ? 'preparing secure payment…' : 'redirecting…'}
              </>
            ) : customQuote ? (
              'custom quote required'
            ) : (
              <>
                <Lock className="h-4 w-4" strokeWidth={2.25} />
                {embedded ? 'continue to payment' : 'confirm subscription'}
              </>
            )}
          </span>
        </button>
      )}

      {!customQuote && (
        <p
          className={`text-center text-[11px] text-ink-faint ${reveal(0)}`}
          style={{ transitionDelay: '400ms' }}
        >
          cancel anytime.
        </p>
      )}
    </div>
  );
}
