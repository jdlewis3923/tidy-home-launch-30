import { useState, useEffect } from 'react';
import { Lock, ShieldCheck, Sparkles, CreditCard, Check } from 'lucide-react';
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

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

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

  // XL size upgrades shown as their own line items so the breakdown
  // matches the Stripe Checkout invoice exactly.
  const xlLines = state.services
    .map((svc): { svc: ServiceType; qty: number } | null => {
      const tier =
        svc === 'cleaning' ? state.homeSize :
        svc === 'lawn' ? state.yardSize :
        state.vehicleSize;
      if (tier !== 'xl') return null;
      const qty = svc === 'detailing' ? state.vehicleCount : 1;
      return { svc, qty };
    })
    .filter((x): x is { svc: ServiceType; qty: number } => x !== null);

  const handlePay = async () => {
    if (customQuote || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await startCheckout({ config: state });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed. Please try again.');
      setSubmitting(false);
    }
  };

  // Stagger reveal helper
  const reveal = (delay: number) =>
    `transition-all duration-700 ease-out ${
      mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
    }`;

  return (
    <div className="space-y-6">
      {/* Premium order summary card — navy gradient, gold accents */}
      <div
        className={`relative overflow-hidden rounded-2xl border border-navy/20 bg-gradient-to-br from-navy-deep via-navy to-navy-deep p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.6)] ${reveal(0)}`}
        style={{ transitionDelay: '40ms' }}
      >
        {/* Soft gold glow blob */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gold/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
        />

        <div className="relative">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/15 ring-1 ring-gold/30">
                <Sparkles className="h-3.5 w-3.5 text-gold" />
              </div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                Order Summary
              </h3>
            </div>
            <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/70 ring-1 ring-white/10">
              Monthly plan
            </span>
          </div>

          <div className="space-y-2.5 text-sm">
            {pricing.servicePrices.map((sp, idx) => {
              const tier =
                sp.service === 'cleaning' ? state.homeSize :
                sp.service === 'lawn' ? state.yardSize :
                state.vehicleSize;
              const qty = sp.service === 'detailing' ? state.vehicleCount : 1;
              const baseDisplay = tier === 'xl'
                ? sp.price - XL_UPCHARGE[sp.service] * qty
                : sp.price;
              return (
                <div
                  key={sp.service}
                  className={`flex justify-between items-baseline gap-3 ${reveal(0)}`}
                  style={{ transitionDelay: `${120 + idx * 60}ms` }}
                >
                  <span className="text-white/90">
                    <span className="mr-1.5">{serviceIcons[sp.service]}</span>
                    <span className="font-semibold">{serviceLabels[sp.service]}</span>
                    <span className="text-white/50 ml-1.5 text-xs">— {frequencyLabels[state.frequencies[sp.service]!]}</span>
                    {sp.service === 'detailing' && state.vehicleCount > 1 && (
                      <span className="text-white/50 ml-1 text-xs">× {state.vehicleCount}</span>
                    )}
                  </span>
                  <span className="font-semibold text-white tabular-nums">
                    {tier === 'custom' ? 'Custom' : `$${baseDisplay.toFixed(2)}`}
                  </span>
                </div>
              );
            })}

            {xlLines.map(({ svc, qty }) => (
              <div key={`xl-${svc}`} className="flex justify-between items-baseline gap-3 text-white/80">
                <span className="text-xs">
                  ↳ {serviceLabels[svc]} XL Size Upgrade
                  {qty > 1 && <span className="text-white/50 ml-1">× {qty}</span>}
                </span>
                <span className="font-medium text-white/90 tabular-nums text-xs">
                  +${(XL_UPCHARGE[svc] * qty).toFixed(2)}
                </span>
              </div>
            ))}

            {pricing.discountPercent > 0 && (
              <div className="flex justify-between items-baseline gap-3">
                <span className="inline-flex items-center gap-1.5 text-gold text-xs font-semibold">
                  <Sparkles className="h-3 w-3" />
                  Bundle discount ({Math.round(pricing.discountPercent * 100)}%)
                </span>
                <span className="text-gold font-semibold tabular-nums">−${pricing.discountAmount.toFixed(2)}</span>
              </div>
            )}

            {state.addOns.map(id => {
              const addon = addOnData[id];
              if (!addon) return null;
              const price = addon.service === 'detailing' ? addon.price * state.vehicleCount : addon.price;
              return (
                <div key={id} className="flex justify-between items-baseline gap-3 text-white/80 text-xs">
                  <span>+ {addon.name}</span>
                  <span className="tabular-nums">${price.toFixed(2)}</span>
                </div>
              );
            })}

            {promoCode && !customQuote && (
              <div className="flex justify-between items-baseline gap-3">
                <span className="inline-flex items-center gap-1.5 text-gold text-xs font-semibold">
                  <Sparkles className="h-3 w-3" />
                  Referral credit · {promoCode}
                </span>
                <span className="text-gold font-semibold tabular-nums">−${(REFERRAL_DISCOUNT_CENTS / 100).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Total today</p>
              {!customQuote && (
                <p className="mt-1 text-[11px] text-white/60">
                  Then <span className="font-semibold text-white/80 tabular-nums">${pricing.ongoing.toFixed(2)}</span>/mo · cancel anytime
                </p>
              )}
            </div>
            <div className="text-right">
              {customQuote ? (
                <span className="text-2xl font-black text-gold tracking-tight">Custom quote</span>
              ) : (
                <>
                  {promoCode && (
                    <div className="text-xs text-white/40 line-through tabular-nums">${pricing.firstMonth.toFixed(2)}</div>
                  )}
                  <div
                    className="text-4xl font-black tracking-tight tabular-nums bg-gradient-to-br from-gold to-gold-foreground/90 bg-clip-text text-transparent"
                    style={{ letterSpacing: '-0.03em' }}
                  >
                    ${totalToday.toFixed(2)}
                  </div>
                </>
              )}
            </div>
          </div>

          {promoCode && !customQuote && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1 text-[11px] font-semibold text-gold ring-1 ring-gold/20">
              <Check className="h-3 w-3" />
              You saved ${(REFERRAL_DISCOUNT_CENTS / 100).toFixed(2)} with {promoCode}
            </p>
          )}
        </div>
      </div>

      {/* Trust strip */}
      <div
        className={`grid grid-cols-3 gap-2 ${reveal(0)}`}
        style={{ transitionDelay: '220ms' }}
      >
        {[
          { icon: Lock, label: '256-bit SSL' },
          { icon: ShieldCheck, label: 'PCI Compliant' },
          { icon: CreditCard, label: 'Stripe Secured' },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-2 py-3 text-center transition-all hover:border-primary/30 hover:shadow-sm"
          >
            <Icon className="h-4 w-4 text-primary" strokeWidth={2.25} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Consent block */}
      <div
        className={`space-y-3 rounded-xl border border-border bg-card p-4 ${reveal(0)}`}
        style={{ transitionDelay: '280ms' }}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          By paying, you're creating your Tidy account. We'll email your login link so you can manage,
          pause, or cancel your plan anytime.
        </p>

        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={state.smsConsent}
            onChange={e => onChange({ ...state, smsConsent: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary accent-primary"
          />
          <span className="text-[11px] leading-relaxed text-muted-foreground group-hover:text-foreground transition-colors">
            I agree to receive SMS texts from Tidy with service reminders and account notifications.
            Reply STOP to opt out. Msg & data rates may apply.
          </span>
        </label>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          By subscribing, you agree to Tidy's{' '}
          <a href="/terms" className="font-medium text-primary hover:underline">Terms</a> and{' '}
          <a href="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</a>.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive animate-fade-in">
          {error}
        </div>
      )}

      {/* Premium pay button */}
      <button
        type="button"
        onClick={handlePay}
        disabled={submitting || customQuote}
        className={`group relative w-full overflow-hidden rounded-xl bg-gradient-to-br from-gold via-gold to-gold/90 px-6 py-5 text-base font-extrabold text-foreground shadow-[0_10px_30px_-8px_hsl(var(--gold)/0.6)] transition-all duration-300 hover:shadow-[0_18px_40px_-8px_hsl(var(--gold)/0.7)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${reveal(0)}`}
        style={{ transitionDelay: '340ms', letterSpacing: '-0.01em' }}
      >
        {/* Shimmer sweep */}
        {!submitting && !customQuote && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100"
          />
        )}
        <span className="relative inline-flex items-center justify-center gap-2">
          {submitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
              Redirecting to Stripe…
            </>
          ) : customQuote ? (
            'Custom quote required'
          ) : (
            <>
              <Lock className="h-4 w-4" strokeWidth={2.5} />
              Pay & Start My Plan
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </>
          )}
        </span>
      </button>

      {!customQuote && (
        <p
          className={`text-center text-[11px] text-muted-foreground ${reveal(0)}`}
          style={{ transitionDelay: '400ms' }}
        >
          You'll be charged <span className="font-semibold text-foreground tabular-nums">${totalToday.toFixed(2)}</span> today ·
          renews monthly · cancel anytime
        </p>
      )}
    </div>
  );
}
