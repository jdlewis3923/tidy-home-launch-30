import { useState } from 'react';
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
  const customQuote = hasCustomQuote(state);

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

  return (
    <div className="space-y-6">
      {/* Line-item breakdown */}
      <div className="rounded-xl border-[1.5px] border-border bg-card p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Order summary</h3>

        <div className="space-y-2 text-sm">
          {pricing.servicePrices.map(sp => {
            // Show base recurring price separately from the XL line below.
            const tier =
              sp.service === 'cleaning' ? state.homeSize :
              sp.service === 'lawn' ? state.yardSize :
              state.vehicleSize;
            const qty = sp.service === 'detailing' ? state.vehicleCount : 1;
            // Strip the XL portion from the display price; XL gets its own line.
            const baseDisplay = tier === 'xl'
              ? sp.price - XL_UPCHARGE[sp.service] * qty
              : sp.price;
            return (
              <div key={sp.service} className="flex justify-between">
                <span className="text-foreground">
                  {serviceIcons[sp.service]} {serviceLabels[sp.service]}
                  <span className="text-muted-foreground ml-1">— {frequencyLabels[state.frequencies[sp.service]!]}</span>
                  {sp.service === 'detailing' && state.vehicleCount > 1 && (
                    <span className="text-muted-foreground ml-1">× {state.vehicleCount}</span>
                  )}
                </span>
                <span className="font-semibold text-foreground">
                  {tier === 'custom' ? 'Custom quote' : `$${baseDisplay.toFixed(2)}`}
                </span>
              </div>
            );
          })}

          {xlLines.map(({ svc, qty }) => (
            <div key={`xl-${svc}`} className="flex justify-between">
              <span className="text-foreground">
                {serviceIcons[svc]} {serviceLabels[svc]} XL Size Upgrade
                {qty > 1 && <span className="text-muted-foreground ml-1">× {qty}</span>}
              </span>
              <span className="font-semibold text-foreground">
                ${(XL_UPCHARGE[svc] * qty).toFixed(2)}
              </span>
            </div>
          ))}

          {pricing.discountPercent > 0 && (
            <div className="flex justify-between text-success">
              <span>Bundle discount ({Math.round(pricing.discountPercent * 100)}%)</span>
              <span>−${pricing.discountAmount.toFixed(2)}</span>
            </div>
          )}

          {state.addOns.map(id => {
            const addon = addOnData[id];
            if (!addon) return null;
            const price = addon.service === 'detailing' ? addon.price * state.vehicleCount : addon.price;
            return (
              <div key={id} className="flex justify-between">
                <span className="text-foreground">{addon.name}</span>
                <span className="text-foreground">${price.toFixed(2)}</span>
              </div>
            );
          })}

          {promoCode && !customQuote && (
            <div className="flex justify-between text-success">
              <span>Referral discount (${REFERRAL_DISCOUNT_CENTS / 100} off 1st mo)</span>
              <span>−${(REFERRAL_DISCOUNT_CENTS / 100).toFixed(2)}</span>
            </div>
          )}
        </div>

        <hr className="border-border" />

        <div className="flex justify-between items-baseline">
          <span className="text-sm font-semibold text-foreground">Total today</span>
          <div className="text-right">
            {customQuote ? (
              <span className="text-lg font-bold text-primary">Custom quote</span>
            ) : (
              <>
                {promoCode && (
                  <div className="text-xs text-muted-foreground line-through">${pricing.firstMonth.toFixed(2)}</div>
                )}
                <span className="text-lg font-bold text-primary">${totalToday.toFixed(2)}</span>
              </>
            )}
          </div>
        </div>
        {promoCode && !customQuote && (
          <p className="text-xs text-success font-medium text-right">
            You saved ${(REFERRAL_DISCOUNT_CENTS / 100).toFixed(2)} with code {promoCode}
          </p>
        )}
        {!customQuote && (
          <p className="text-xs text-muted-foreground">Then ${pricing.ongoing.toFixed(2)}/mo · Cancel anytime</p>
        )}
      </div>

      <div className="space-y-3 text-sm text-muted-foreground">
        <p>By paying, you're creating your Tidy account. You'll get an email with your login link so you can manage your plan, view service history, and cancel or pause anytime.</p>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={state.smsConsent}
            onChange={e => onChange({ ...state, smsConsent: e.target.checked })}
            className="mt-1 h-4 w-4 rounded border-border text-primary accent-primary"
          />
          <span className="text-xs">
            I agree to receive SMS texts from Tidy with service reminders, updates, and account notifications. Reply STOP anytime to opt out. Msg & data rates may apply.
          </span>
        </label>

        <p className="text-xs">
          By subscribing, you agree to Tidy's{' '}
          <a href="/terms" className="text-primary hover:underline">Terms of Service</a> and{' '}
          <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={submitting || customQuote}
        className="w-full rounded-lg bg-gradient-to-r from-gold/80 to-gold px-6 py-4 text-base font-extrabold text-foreground shadow-lg transition-all hover:shadow-xl hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {submitting ? 'Redirecting to Stripe…' : customQuote ? 'Custom quote required' : 'Pay & Start My Plan →'}
      </button>

      {!customQuote && (
        <p className="text-center text-xs text-muted-foreground">
          You'll be charged ${totalToday.toFixed(2)} today · Renews monthly · Cancel anytime
        </p>
      )}

      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span>🔒 256-bit SSL</span>
        <span>|</span>
        <span>Powered by Stripe</span>
        <span>|</span>
        <span>PCI Compliant</span>
      </div>
    </div>
  );
}
