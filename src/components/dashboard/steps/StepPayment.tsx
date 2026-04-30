import { useState, useEffect, useMemo } from 'react';
import { Lock, ShieldCheck, CreditCard, BadgeCheck, Banknote, X as XIcon } from 'lucide-react';
import {
  ConfigState,
  calculatePricing,
  REFERRAL_DISCOUNT_CENTS,
  serviceLabels,
  serviceIcons,
  frequencyLabels,
  addOnData,
  hasCustomQuote,
  XL_UPCHARGE,
  ServiceType,
} from '@/lib/dashboard-pricing';
import { usePromoState } from '@/hooks/usePromoCapture';
import { startCheckout } from '@/lib/checkout';
import { provisionAccount } from '@/lib/account-provisioning';
import { STRIPE_INTEGRATION_ENABLED } from '@/lib/dashboard-config';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getStripe, isEmbeddedCheckoutAvailable } from '@/lib/stripe-client';
import EmbeddedPaymentForm from '@/components/dashboard/EmbeddedPaymentForm';
import { getUtmAttribution } from '@/lib/utm';

// Per-vehicle add-ons (keep in sync with src/lib/checkout.ts).
const PER_VEHICLE_ADDONS = new Set(['ozone', 'petHair', 'engineBay', 'ceramicSpray']);
const XL_ADDON_BY_SERVICE: Record<ServiceType, string> = {
  cleaning: 'xl_cleaning',
  lawn: 'xl_lawn',
  detailing: 'xl_detailing',
};

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
  const pricing = calculatePricing(state);
  const { code: promoCode } = usePromoState();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const customQuote = hasCustomQuote(state);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const referralDiscount = promoCode ? REFERRAL_DISCOUNT_CENTS / 100 : 0;
  const totalToday = Math.max(0, pricing.firstMonth - referralDiscount);

  // XL upgrades broken out as their own line items (matches Stripe invoice).
  const xlLines = state.services
    .map((svc): { svc: ServiceType; qty: number } | null => {
      const tier = svc === 'cleaning' ? state.homeSize
                : svc === 'lawn' ? state.yardSize
                : state.vehicleSize;
      if (tier !== 'xl') return null;
      const qty = svc === 'detailing' ? state.vehicleCount : 1;
      return { svc, qty };
    })
    .filter((x): x is { svc: ServiceType; qty: number } => x !== null);

  const navigate = useNavigate();
  const embedded = isEmbeddedCheckoutAvailable();
  const stripePromise = useMemo(() => (embedded ? getStripe() : null), [embedded]);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  // Translate ConfigState into the flat shape the edge fn expects.
  const buildIntentBody = () => {
    const vehicleCount = Math.max(1, Number(state.vehicleCount) || 1);
    const services = state.services
      .map((svc) => state.frequencies[svc] ? { service: svc, frequency: state.frequencies[svc]! } : null)
      .filter((x): x is { service: ServiceType; frequency: 'monthly' | 'biweekly' | 'weekly' } => !!x);
    const addons: Array<{ addon_name: string; qty: number }> = [];
    for (const svc of state.services) {
      const tier = svc === 'cleaning' ? state.homeSize : svc === 'lawn' ? state.yardSize : state.vehicleSize;
      if (tier === 'xl') addons.push({ addon_name: XL_ADDON_BY_SERVICE[svc], qty: svc === 'detailing' ? vehicleCount : 1 });
    }
    for (const id of state.addOns ?? []) {
      addons.push({ addon_name: id, qty: PER_VEHICLE_ADDONS.has(id) ? vehicleCount : 1 });
    }
    const attr = getUtmAttribution();
    return {
      services, addons, promo_code: promoCode ?? undefined,
      zip: state.zip, preferred_day: state.preferredDay, preferred_time: state.preferredTime,
      lang: 'en' as const,
      idempotency_key: `cfg:${state.zip}:${services.map(s => s.service + ':' + s.frequency).sort().join(',')}:${addons.map(a => a.addon_name + 'x' + a.qty).sort().join(',')}`,
      gclid: attr.gclid, utm_source: attr.utm_source, utm_medium: attr.utm_medium,
      utm_campaign: attr.utm_campaign, utm_content: attr.utm_content, utm_term: attr.utm_term,
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
      } else if (STRIPE_INTEGRATION_ENABLED) {
        await startCheckout({ config: state });
      } else {
        navigate('/dashboard/confirmation');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'checkout failed. please try again.');
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
            const tier = sp.service === 'cleaning' ? state.homeSize
                      : sp.service === 'lawn' ? state.yardSize
                      : state.vehicleSize;
            const qty = sp.service === 'detailing' ? state.vehicleCount : 1;
            const baseDisplay = tier === 'xl' ? sp.price - XL_UPCHARGE[sp.service] * qty : sp.price;
            return (
              <div
                key={sp.service}
                className={`flex justify-between items-baseline gap-3 ${reveal(0)}`}
                style={{ transitionDelay: `${120 + idx * 60}ms` }}
              >
                <span className="text-ink">
                  <span className="mr-1.5">{serviceIcons[sp.service]}</span>
                  <span className="font-semibold lowercase">{serviceLabels[sp.service]}</span>
                  <span className="text-ink-faint ml-1.5 text-xs lowercase">— {frequencyLabels[state.frequencies[sp.service]!]}</span>
                  {sp.service === 'detailing' && state.vehicleCount > 1 && (
                    <span className="text-ink-faint ml-1 text-xs">× {state.vehicleCount}</span>
                  )}
                </span>
                <span className="font-semibold text-ink tabular-nums">
                  {tier === 'custom' ? 'custom' : `$${baseDisplay.toFixed(2)}`}
                </span>
              </div>
            );
          })}

          {xlLines.map(({ svc, qty }) => (
            <div key={`xl-${svc}`} className="flex justify-between items-baseline gap-3 text-ink-soft">
              <span className="text-xs lowercase">↳ {serviceLabels[svc]} · xl size {qty > 1 && `× ${qty}`}</span>
              <span className="text-xs tabular-nums">+${(XL_UPCHARGE[svc] * qty).toFixed(2)}</span>
            </div>
          ))}

          {pricing.discountPercent > 0 && (
            <div className="flex justify-between items-baseline gap-3 text-ink">
              <span className="text-xs">bundle saving · {Math.round(pricing.discountPercent * 100)}%</span>
              <span className="text-xs tabular-nums">−${pricing.discountAmount.toFixed(2)}</span>
            </div>
          )}

          {state.addOns.map(id => {
            const addon = addOnData[id];
            if (!addon) return null;
            const price = addon.service === 'detailing' ? addon.price * state.vehicleCount : addon.price;
            return (
              <div key={id} className="flex justify-between items-baseline gap-3 text-ink-soft text-xs">
                <span>+ {addon.name}</span>
                <span className="tabular-nums">${price.toFixed(2)}</span>
              </div>
            );
          })}

          {promoCode && !customQuote && (
            <div className="flex justify-between items-baseline gap-3 text-ink">
              <span className="text-xs">referral · {promoCode}</span>
              <span className="text-xs tabular-nums">−${(REFERRAL_DISCOUNT_CENTS / 100).toFixed(2)}</span>
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
                {promoCode && (
                  <div className="text-xs text-ink-faint line-through tabular-nums">${pricing.firstMonth.toFixed(2)}</div>
                )}
                <div className="text-4xl font-bold text-ink tabular-nums tracking-tight">
                  ${totalToday.toFixed(2)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 48-Hour Re-do Guarantee — prominent near price summary. */}
      <div
        className={`flex items-center gap-3 rounded-xl border-2 border-gold/40 bg-gold/10 px-4 py-3 ${reveal(0)}`}
        style={{ transitionDelay: '180ms' }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/20 ring-1 ring-gold/50">
          <BadgeCheck className="h-5 w-5 text-gold" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-ink leading-tight">48-hour Re-do Guarantee</p>
          <p className="text-[11px] text-ink-soft mt-0.5 leading-snug">
            Not happy? We come back free within 48 hours.
          </p>
        </div>
      </div>

      {/* Pre-checkout trust badge row — bonded / insured / vetted / cancel anytime. */}
      <div
        className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${reveal(0)}`}
        style={{ transitionDelay: '220ms' }}
      >
        {[
          { icon: Banknote,    label: 'Bonded $25k' },
          { icon: ShieldCheck, label: '$1M Insured' },
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
            checked={state.smsConsent}
            onChange={e => onChange({ ...state, smsConsent: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-hairline text-ink accent-ink"
          />
          <span className="text-[11px] leading-relaxed text-ink-soft group-hover:text-ink transition-colors">
            i agree to receive sms texts from tidy with service reminders. reply stop to opt out.
          </span>
        </label>

        <p className="text-[11px] leading-relaxed text-ink-faint">
          by subscribing, you agree to tidy's{' '}
          <a href="/terms" className="font-medium text-ink hover:underline">terms</a> and{' '}
          <a href="/privacy" className="font-medium text-ink hover:underline">privacy policy</a>.
        </p>
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
