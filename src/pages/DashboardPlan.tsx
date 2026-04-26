import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import tidyLogo from '@/assets/tidy-logo.png';
import { ConfigState, ServiceType, Frequency, loadState, saveState, clearState, hasCustomQuote } from '@/lib/dashboard-pricing';
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
import CustomQuoteModal from '@/components/dashboard/CustomQuoteModal';

const STEPS = [
  { heading: 'What do you want handled?', sub: 'Pick one, two, or all three. The more you bundle, the more you save.', cta: 'Continue →' },
  { heading: 'How often should we show up?', sub: 'More frequent = lower cost per visit. Change anytime — no lock-in.', cta: 'Looks good →' },
  { heading: 'Tell us about your place', sub: 'This helps us match you with the right pro and finalize your price.', cta: 'Next step →' },
  { heading: 'Almost there — just the basics', sub: "We'll use this to create your account and reach out before your first visit.", cta: 'Continue to add-ons →' },
  { heading: 'Want anything extra for the first visit?', sub: 'These are one-time add-ons. Not monthly — just for when you want them.', cta: 'Review my plan →', skip: 'No thanks, my plan is good →' },
  { heading: "Here's your plan — does this look right?", sub: 'You can go back and change anything before you pay.', cta: 'Looks great — go to checkout →' },
  { heading: 'Secure checkout', sub: 'Your payment is encrypted and processed securely by Stripe.', cta: 'Pay & start my plan →' },
];

// Maps the LP/ad URL ?service= values to dashboard ServiceType.
const SERVICE_PARAM_MAP: Record<string, ServiceType> = {
  cleaning: 'cleaning',
  lawn: 'lawn',
  detailing: 'detailing',
};

// Maps the LP ?plan= values to a dashboard Frequency.
// Detailing's "biweekly" plan slug = the Premium tier (also biweekly billing).
// Detailing's "full" plan slug → biweekly + full-detail intent (closest auto-pick).
const PLAN_PARAM_MAP: Record<string, Frequency> = {
  monthly: 'monthly',
  biweekly: 'biweekly',
  weekly: 'weekly',
  full: 'biweekly',
};

export default function DashboardPlan() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ConfigState>(loadState);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const customQuote = hasCustomQuote(state);

  // Preselect service / plan / bundle from incoming ad URL params, once.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const serviceParam = params.get('service');
    const planParam = params.get('plan');
    const bundleParam = params.get('bundle');
    const servicesParam = params.get('services'); // comma-separated for bundles

    if (!serviceParam && !bundleParam && !servicesParam) return;

    setState((prev) => {
      const next: ConfigState = { ...prev, frequencies: { ...prev.frequencies } };

      // Bundle: services=cleaning,lawn,detailing
      if (servicesParam) {
        const slugs = servicesParam
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s): s is keyof typeof SERVICE_PARAM_MAP => s in SERVICE_PARAM_MAP)
          .map((s) => SERVICE_PARAM_MAP[s]);
        if (slugs.length) {
          const merged = Array.from(new Set([...prev.services, ...slugs]));
          next.services = merged;
          for (const svc of slugs) {
            if (!next.frequencies[svc]) {
              next.frequencies[svc] = svc === 'lawn' ? 'monthly' : 'biweekly';
            }
          }
        }
      }

      // Single service preselect
      if (serviceParam && SERVICE_PARAM_MAP[serviceParam]) {
        const svc = SERVICE_PARAM_MAP[serviceParam];
        if (!next.services.includes(svc)) next.services = [...next.services, svc];
        const planFreq = planParam && PLAN_PARAM_MAP[planParam];
        if (planFreq) {
          // Detailing has no weekly — clamp to biweekly.
          next.frequencies[svc] =
            svc === 'detailing' && planFreq === 'weekly' ? 'biweekly' : planFreq;
        } else if (!next.frequencies[svc]) {
          next.frequencies[svc] = svc === 'lawn' ? 'monthly' : 'biweekly';
        }
      }

      saveState(next);
      return next;
    });
    // run once per pathname/search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Custom Quote: on Review step, intercept the CTA → open the modal
    // instead of routing the user to Stripe checkout.
    if (step === 5 && customQuote) {
      setQuoteOpen(true);
      return;
    }
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
    <div className="relative min-h-screen overflow-hidden pb-24">
      {/* Layered background — replaces the flat white sides with depth */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Base soft gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(217,91%,97%)] via-background to-[hsl(217,91%,96%)]" />
        {/* Gold warm-up at top-right */}
        <div className="absolute -top-32 -right-40 h-[520px] w-[520px] rounded-full bg-gold/15 blur-[120px]" />
        {/* Blue cool-down bottom-left */}
        <div className="absolute -bottom-40 -left-40 h-[560px] w-[560px] rounded-full bg-primary/20 blur-[140px]" />
        {/* Navy depth top-left */}
        <div className="absolute top-1/3 -left-32 h-[380px] w-[380px] rounded-full bg-navy/10 blur-[120px]" />
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(hsl(var(--primary) / 0.35) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage:
              'radial-gradient(ellipse at center, black 40%, transparent 75%)',
            WebkitMaskImage:
              'radial-gradient(ellipse at center, black 40%, transparent 75%)',
          }}
        />
      </div>

      {/* Header */}
      <header className="relative border-b border-border/60 bg-card/70 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <img src={tidyLogo} alt="Tidy" className="h-[72px] w-auto" />
          <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/20">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
      </header>

      <div className="relative mx-auto max-w-2xl px-4 pt-6 space-y-6">
        <ProgressBar currentStep={step} totalSteps={STEPS.length} />
        <PromoBanner />

        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground" style={{ letterSpacing: '-0.035em', lineHeight: 0.98 }}>
            {stepInfo.heading}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{stepInfo.sub}</p>
        </div>

        {/* Step content */}
        {step === 0 && <StepServices state={state} onChange={updateState} />}
        {step === 1 && <StepFrequency state={state} onChange={updateState} />}
        {step === 2 && <StepProperty state={state} onChange={updateState} />}
        {step === 3 && <StepDetails state={state} onChange={updateState} />}
        {step === 4 && <StepAddOns state={state} onChange={updateState} />}
        {step === 5 && <StepReview state={state} onEdit={() => setStep(0)} />}
        {step === 6 && <StepPayment state={state} onChange={updateState} />}

        {/* Custom-quote notice — replaces the Stripe path with a tailored-plan flow */}
        {(step === 5 || step === 6) && customQuote && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
            <p className="font-semibold mb-1">Custom Plan Required</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              We'll create a plan tailored to your home — no payment today. Tap "Get My Plan" and we'll reach out shortly.
            </p>
          </div>
        )}

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
              {customQuote && step === 5 ? 'Get My Plan →' : stepInfo.cta}
            </button>
          )}
        </div>
      </div>

      <CustomQuoteModal
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        state={state}
        onSubmitted={() => {
          setQuoteOpen(false);
          clearState();
          navigate('/dashboard/confirmation');
        }}
      />

      <StickyPriceBar state={state} currentStep={step} />
    </div>
  );
}
