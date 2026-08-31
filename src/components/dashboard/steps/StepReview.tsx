import { ConfigState, calculatePricing, serviceLabels, serviceIcons, frequencyLabels, addOnData, sizeLabels, sizeFor, serviceUnits, frequencyVisitCopy, formatPerVisit, formatMonthly, hasCustomQuote } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onEdit: () => void;
}

/**
 * Apple-calm review screen: feels like confirmation, not checkout pressure.
 * Cream paper, ink type, hairline dividers. The headline is owned by the
 * shell ("your home, handled.") — this card just lays out what they chose.
 */
export default function StepReview({ state, onEdit }: Props) {
  const pricing = calculatePricing(state);
  const customQuote = hasCustomQuote(state);
  const firstMonthTotal = pricing.firstMonth;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-hairline bg-white p-6 shadow-[0_8px_32px_-16px_hsl(var(--ink)/0.18)] animate-calm-rise">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">your plan</h3>

        <div className="mt-4 space-y-2.5">
          {pricing.servicePrices.map(sp => {
            const size = sizeFor(state, sp.service);
            const quoted = !size || size === 'quote';
            const freq = state.frequencies[sp.service]!;
            return (
              <div key={sp.service} className="flex justify-between items-baseline text-sm">
                <span className="text-ink">
                  <span className="mr-1.5">{serviceIcons[sp.service]}</span>
                  <span className="font-semibold lowercase">{serviceLabels[sp.service]}</span>
                  <span className="text-ink-faint ml-2 lowercase">
                    {serviceUnits[sp.service] === 'per_month' ? 'monthly' : frequencyLabels[freq].toLowerCase()}
                  </span>
                  {!quoted && (
                    <span className="ml-2 text-[11px] text-ink-faint lowercase">
                      · {sizeLabels[sp.service][size as 1 | 2 | 3].toLowerCase()} ·{' '}
                      {serviceUnits[sp.service] === 'per_month'
                        ? formatMonthly(sp.sticker)
                        : `${formatPerVisit(sp.sticker)} · ${frequencyVisitCopy[freq]}`}
                    </span>
                  )}
                </span>
                <span className="font-semibold text-ink tabular-nums">
                  {quoted ? 'quote' : `$${sp.price.toFixed(2)}/mo`}
                </span>
              </div>
            );
          })}
        </div>

        {!customQuote ? (
          <>
            <div className="my-5 h-px bg-hairline" />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-ink-soft">
                <span>subtotal</span>
                <span className="tabular-nums">${pricing.subtotal.toFixed(2)}/mo</span>
              </div>
              {pricing.carWashSubtotal > 0 && (
                <div className="flex justify-between text-ink-soft">
                  <span>car wash add-on</span>
                  <span className="tabular-nums">${pricing.carWashSubtotal.toFixed(2)}/mo</span>
                </div>
              )}
              {pricing.freeAddons > 0 && (
                <div className="flex justify-between text-ink">
                  <span>1 free premium add-on a month — your pick</span>
                  <span className="tabular-nums">included</span>
                </div>
              )}

              {state.addOns.length > 0 && (
                <>
                  <div className="my-3 h-px bg-hairline" />
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">add-ons · first visit</p>
                  {state.addOns.map(id => {
                    const addon = addOnData[id];
                    if (!addon) return null;
                    return (
                      <div key={id} className="flex justify-between text-ink-soft">
                        <span>{addon.name}</span>
                        <span className="tabular-nums">${addon.price.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </>
              )}


              {pricing.taxTriggered && (
                <div className="flex justify-between text-ink-soft">
                  <span>FL sales tax ({pricing.taxPercentage}%, coating applied)</span>
                  <span className="tabular-nums">${pricing.taxAmount.toFixed(2)}/mo</span>
                </div>
              )}
            </div>


            <div className="my-5 h-px bg-hairline" />

            <div className="flex justify-between items-end">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">first visit</p>
                <p className="text-[11px] text-ink-faint mt-1">then ${pricing.ongoing.toFixed(2)}/mo · cancel anytime</p>
              </div>
              <p className="text-3xl font-bold text-ink tabular-nums tracking-tight">
                ${firstMonthTotal.toFixed(2)}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="my-5 h-px bg-hairline" />
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">total today</p>
                <p className="text-[11px] text-ink-faint mt-1">we quote this one by hand — no payment today.</p>
              </div>
              <p className="text-xl font-bold text-ink">quote</p>
            </div>
          </>
        )}

        <div className="mt-5 h-px bg-hairline" />

        <dl className="mt-4 grid gap-2 text-[12px] text-ink-soft">
          <div className="flex justify-between"><dt className="text-ink-faint">address</dt><dd className="text-right">{state.address}, {state.city} {state.zip}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-faint">preferred</dt><dd className="text-right lowercase">{state.preferredDay || 'no preference'} {state.preferredTime ? (state.preferredTime === 'morning' ? 'mornings' : 'afternoons') : ''}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-faint">account</dt><dd className="text-right">{state.email}</dd></div>
        </dl>

        <button
          type="button"
          onClick={onEdit}
          className="mt-5 text-xs font-medium text-ink-faint hover:text-ink underline-offset-4 hover:underline"
        >
          ← edit plan
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[11px] text-ink-faint">
        {['cancel anytime', 'background-checked pros', 'photo verified', 'satisfaction guarantee'].map(t => (
          <div key={t} className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-ink/40" />
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
