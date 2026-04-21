import { ConfigState, calculatePricing, REFERRAL_DISCOUNT_CENTS, serviceLabels, serviceIcons, frequencyLabels, addOnData } from '@/lib/dashboard-pricing';
import { usePromoState } from '@/hooks/usePromoCapture';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

export default function StepPayment({ state, onChange }: Props) {
  const pricing = calculatePricing(state);
  const { code: promoCode } = usePromoState();

  const referralDiscount = promoCode ? REFERRAL_DISCOUNT_CENTS / 100 : 0;
  const totalToday = Math.max(0, pricing.firstMonth - referralDiscount);

  return (
    <div className="space-y-6">
      {/* Line-item breakdown */}
      <div className="rounded-xl border-[1.5px] border-border bg-card p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Order summary</h3>

        <div className="space-y-2 text-sm">
          {pricing.servicePrices.map(sp => (
            <div key={sp.service} className="flex justify-between">
              <span className="text-foreground">
                {serviceIcons[sp.service]} {serviceLabels[sp.service]}
                <span className="text-muted-foreground ml-1">— {frequencyLabels[state.frequencies[sp.service]!]}</span>
              </span>
              <span className="font-semibold text-foreground">${sp.price.toFixed(2)}</span>
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

          {promoCode && (
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
            {promoCode && (
              <div className="text-xs text-muted-foreground line-through">${pricing.firstMonth.toFixed(2)}</div>
            )}
            <span className="text-lg font-bold text-primary">${totalToday.toFixed(2)}</span>
          </div>
        </div>
        {promoCode && (
          <p className="text-xs text-success font-medium text-right">
            You saved ${(REFERRAL_DISCOUNT_CENTS / 100).toFixed(2)} with code {promoCode}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Then ${pricing.ongoing.toFixed(2)}/mo · Cancel anytime</p>
      </div>

      <div className="rounded-xl border-[1.5px] border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-bold text-foreground">Payment details</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Card number</label>
            <div className="rounded-lg border-[1.5px] border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Stripe Elements will render here
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Expiry</label>
              <div className="rounded-lg border-[1.5px] border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">MM/YY</div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CVC</label>
              <div className="rounded-lg border-[1.5px] border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">CVC</div>
            </div>
          </div>
        </div>
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

      <button
        type="button"
        className="w-full rounded-lg bg-gradient-to-r from-gold/80 to-gold px-6 py-4 text-base font-extrabold text-foreground shadow-lg transition-all hover:shadow-xl hover:scale-[1.01]"
      >
        Pay & Start My Plan →
      </button>

      <p className="text-center text-xs text-muted-foreground">
        You'll be charged ${totalToday.toFixed(2)} today · Renews monthly · Cancel anytime
      </p>

      <p className="text-xs text-muted-foreground/70 text-center">Billing is handled automatically based on your selected plan.</p>

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
