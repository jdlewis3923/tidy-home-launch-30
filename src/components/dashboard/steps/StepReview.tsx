import { ConfigState, calculatePricing, serviceLabels, serviceIcons, frequencyLabels, addOnData, sizeTierCopy, hasCustomQuote } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onEdit: () => void;
}

export default function StepReview({ state, onEdit }: Props) {
  const pricing = calculatePricing(state);
  const customQuote = hasCustomQuote(state);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border-[1.5px] border-border bg-card p-6 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your Services</h3>
        <div className="space-y-2">
          {pricing.servicePrices.map(sp => {
            const tier =
              sp.service === 'cleaning' ? state.homeSize
              : sp.service === 'lawn' ? state.yardSize
              : state.vehicleSize;
            const tierLabel = tier ? sizeTierCopy[sp.service][tier].label : null;
            return (
              <div key={sp.service} className="flex justify-between text-sm">
                <span className="text-foreground">
                  {serviceIcons[sp.service]} {serviceLabels[sp.service]}
                  <span className="text-muted-foreground ml-2">{frequencyLabels[state.frequencies[sp.service]!]}</span>
                  {tierLabel && tierLabel !== 'Standard' && (
                    <span className="ml-2 text-xs text-primary font-semibold">· {tierLabel}</span>
                  )}
                </span>
                <span className="font-semibold text-foreground">
                  {tier === 'custom' ? 'Custom quote' : `$${sp.price.toFixed(2)}/mo`}
                </span>
              </div>
            );
          })}
        </div>
        {customQuote ? (
          <>
            <hr className="border-border" />
            <div className="space-y-1">
              <div className="flex justify-between text-base font-bold">
                <span className="text-foreground">Total today</span>
                <span className="text-primary">Custom Plan Required</span>
              </div>
              <p className="text-xs text-muted-foreground">
                We'll create a plan tailored to your home — no payment today.
              </p>
            </div>
          </>
        ) : (
          <>
            <hr className="border-border" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Services subtotal</span>
              <span className="text-foreground">${pricing.subtotal.toFixed(2)}/mo</span>
            </div>
            {pricing.discountPercent > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>Bundle discount ({Math.round(pricing.discountPercent * 100)}%)</span>
                <span>−${pricing.discountAmount.toFixed(2)}/mo</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold">
              <span className="text-foreground">Services total</span>
              <span className="text-foreground">${pricing.servicesTotal.toFixed(2)}/mo</span>
            </div>

            {state.addOns.length > 0 && (
              <>
                <hr className="border-border" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Add-ons (first month)</h3>
                {state.addOns.map(id => {
                  const addon = addOnData[id];
                  if (!addon) return null;
                  return (
                    <div key={id} className="flex justify-between text-sm">
                      <span className="text-foreground">{addon.name}</span>
                      <span className="text-foreground">${addon.price.toFixed(2)}</span>
                    </div>
                  );
                })}
              </>
            )}

            <hr className="border-border" />
            <div className="space-y-1">
              <div className="flex justify-between text-base font-bold">
                <span className="text-foreground">First month</span>
                <span className="text-primary">${pricing.firstMonth.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Ongoing</span>
                <span>${pricing.ongoing.toFixed(2)}/mo</span>
              </div>
            </div>
          </>
        )}

        <hr className="border-border" />
        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>Service address:</strong> {state.address}, {state.city} {state.zip}</p>
          <p><strong>Preferred day:</strong> {state.preferredDay || 'No preference'} {state.preferredTime ? (state.preferredTime === 'morning' ? 'mornings' : 'afternoons') : ''}</p>
          <p><strong>Account email:</strong> {state.email}</p>
        </div>

        <p className="text-xs text-muted-foreground/70">Not perfect? We'll make it right.</p>

        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-semibold text-primary hover:underline"
        >
          ← Edit plan
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {['Cancel anytime — no contracts', 'Background-checked pros', 'Photo verified after every visit', 'Satisfaction guarantee'].map(t => (
          <div key={t} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-success mt-0.5">✓</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
