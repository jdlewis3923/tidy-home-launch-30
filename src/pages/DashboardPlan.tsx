import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import tidyLogo from '@/assets/tidy-logo.png';
import { ConfigState, loadState, saveState, clearState, hasCustomQuote } from '@/lib/dashboard-pricing';
import ProgressBar from '@/components/dashboard/ProgressBar';
import StickyPriceBar from '@/components/dashboard/StickyPriceBar';
import StepServices from '@/components/dashboard/steps/StepServices';
import StepFrequency from '@/components/dashboard/steps/StepFrequency';
import StepProperty from '@/components/dashboard/steps/StepProperty';
import StepDetails from '@/components/dashboard/steps/StepDetails';
import StepAddOns from '@/components/dashboard/steps/StepAddOns';
import StepReview from '@/components/dashboard/steps/StepReview';
import StepPayment from '@/components/dashboard/steps/StepPayment';
import PromoBanner from '@/components/dashboard/PromoBanner';

const STEPS = [
  { heading: 'What do you want handled?', sub: 'Pick one, two, or all three. The more you bundle, the more you save.', cta: 'Continue →' },
  { heading: 'How often should we show up?', sub: 'More frequent = lower cost per visit. Change anytime — no lock-in.', cta: 'Looks good →' },
  { heading: 'Tell us about your place', sub: 'This helps us match you with the right pro and finalize your price.', cta: 'Next step →' },
  { heading: 'Almost there — just the basics', sub: "We'll use this to create your account and reach out before your first visit.", cta: 'Continue to add-ons →' },
  { heading: 'Want anything extra for the first visit?', sub: 'These are one-time add-ons. Not monthly — just for when you want them.', cta: 'Review my plan →', skip: 'No thanks, my plan is good →' },
  { heading: "Here's your plan — does this look right?", sub: 'You can go back and change anything before you pay.', cta: 'Looks great — go to checkout →' },
  { heading: 'Secure checkout', sub: 'Your payment is encrypted and processed securely by Stripe.', cta: 'Pay & start my plan →' },
];

export default function DashboardPlan() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ConfigState>(loadState);
  const navigate = useNavigate();

  const updateState = useCallback((next: ConfigState) => {
    setState(next);
    saveState(next);
  }, []);

  const canAdvance = () => {
    if (step === 0) return state.services.length > 0;
    if (step === 1) return state.services.every(s => !!state.frequencies[s]);
    if (step === 2) {
      if (state.services.includes('cleaning') && !state.homeSize) return false;
      if (state.services.includes('lawn') && !state.yardSize) return false;
      if (state.services.includes('detailing') && !state.vehicleSize) return false;
      return true;
    }
    if (step === 3) return !!(state.firstName && state.lastName && state.email && state.phone && state.address && state.city && state.zip);
    return true;
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else {
      clearState();
      navigate('/dashboard/confirmation');
    }
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const stepInfo = STEPS[step];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <img src={tidyLogo} alt="Tidy" className="h-[72px] w-auto" />
          <span className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-6 space-y-6">
        <ProgressBar currentStep={step} totalSteps={STEPS.length} />
        <PromoBanner />

        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground" style={{ letterSpacing: '-0.03em' }}>
            {stepInfo.heading}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{stepInfo.sub}</p>
        </div>

        {/* Step content */}
        {step === 0 && <StepServices state={state} onChange={updateState} />}
        {step === 1 && <StepFrequency state={state} onChange={updateState} />}
        {step === 2 && <StepProperty state={state} onChange={updateState} />}
        {step === 3 && <StepDetails state={state} onChange={updateState} />}
        {step === 4 && <StepAddOns state={state} onChange={updateState} />}
        {step === 5 && <StepReview state={state} onEdit={() => setStep(0)} />}
        {step === 6 && <StepPayment state={state} onChange={updateState} />}

        {/* Navigation buttons */}
        <div className="flex items-center gap-3 pt-2">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="rounded-lg border border-border px-5 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
            >
              ← Back
            </button>
          )}

          {step === 4 && (
            <button
              type="button"
              onClick={next}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {stepInfo.skip}
            </button>
          )}

          {step < 6 && (
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance()}
              className="ml-auto rounded-lg bg-gradient-to-br from-primary-deep to-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-all hover:shadow-xl hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {stepInfo.cta}
            </button>
          )}
        </div>
      </div>

      <StickyPriceBar state={state} currentStep={step} />
    </div>
  );
}
