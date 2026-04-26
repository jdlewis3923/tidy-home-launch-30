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
import ExistingAccountInline from '@/components/dashboard/ExistingAccountInline';

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
    <div className="relative min-h-screen overflow-hidden pb-24 text-foreground">
      {/* Premium dark layered background — replaces flat white sides */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Deep navy base with vertical gradient for depth */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(217,91%,18%)_0%,hsl(222,47%,8%)_55%,hsl(224,71%,5%)_100%)]" />
        {/* Animated gold warm-up at top-right */}
        <div className="absolute -top-40 -right-40 h-[560px] w-[560px] rounded-full bg-gold/25 blur-[140px] animate-[float_9s_ease-in-out_infinite]" />
        {/* Animated blue cool-down bottom-left */}
        <div
          className="absolute -bottom-48 -left-48 h-[620px] w-[620px] rounded-full bg-primary/30 blur-[150px] animate-[float_11s_ease-in-out_infinite]"
          style={{ animationDelay: '-4s' }}
        />
        {/* Center primary highlight, slow drift */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[420px] w-[420px] rounded-full bg-primary-deep/25 blur-[140px] animate-[float_13s_ease-in-out_infinite]"
          style={{ animationDelay: '-2s' }}
        />
        {/* Crisp dot grid for premium texture */}
        <div
          className="absolute inset-0 opacity-[0.22]"
          style={{
            backgroundImage:
              'radial-gradient(hsl(0 0% 100% / 0.35) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            maskImage:
              'radial-gradient(ellipse at center, black 30%, transparent 80%)',
            WebkitMaskImage:
              'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          }}
        />
        {/* Top vignette to anchor the header */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/40 to-transparent" />
      </div>

      {/* Header — glassmorphic on dark */}
      <header className="relative border-b border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <img src={tidyLogo} alt="Tidy" className="h-[72px] w-auto drop-shadow-[0_4px_20px_rgba(245,197,24,0.35)]" />
          <span className="rounded-full bg-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-gold ring-1 ring-gold/30 shadow-[0_0_20px_rgba(245,197,24,0.15)]">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
      </header>

      <div className="relative mx-auto max-w-2xl px-4 pt-6 space-y-6">
        <ProgressBar currentStep={step} totalSteps={STEPS.length} />
        <PromoBanner />

        <div className="animate-fade-in" key={`heading-${step}`}>
          <h1
            className="text-3xl md:text-4xl font-black tracking-tight text-white"
            style={{ letterSpacing: '-0.035em', lineHeight: 0.98 }}
          >
            {stepInfo.heading}
          </h1>
          <p className="mt-2 text-sm text-white/70">{stepInfo.sub}</p>
        </div>

        {/* Returning customer affordance — only on the first two steps */}
        {step <= 1 && (
          <ExistingAccountInline />
        )}

        {/* Step content — wrapped in a bright card for contrast against the
            dark page background. StepPayment is exempt because it ships with
            its own premium navy summary card. */}
        <div key={`step-${step}`} className="animate-fade-in">
          {step === 6 ? (
            <StepPayment state={state} onChange={updateState} />
          ) : (
            <div className="rounded-2xl border border-white/15 bg-card p-5 md:p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/5">
              {step === 0 && <StepServices state={state} onChange={updateState} />}
              {step === 1 && <StepFrequency state={state} onChange={updateState} />}
              {step === 2 && <StepProperty state={state} onChange={updateState} />}
              {step === 3 && <StepDetails state={state} onChange={updateState} />}
              {step === 4 && <StepAddOns state={state} onChange={updateState} />}
              {step === 5 && <StepReview state={state} onEdit={() => setStep(0)} />}
            </div>
          )}
        </div>

        {/* Custom-quote notice — replaces the Stripe path with a tailored-plan flow */}
        {(step === 5 || step === 6) && customQuote && (
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-white">
            <p className="font-semibold mb-1">Custom Plan Required</p>
            <p className="text-white/70 text-xs leading-relaxed">
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
              className="rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
            >
              ← Back
            </button>
          )}

          {step === 4 && (
            <button
              type="button"
              onClick={next}
              className="text-sm font-semibold text-white/60 hover:text-white transition-colors"
            >
              {stepInfo.skip}
            </button>
          )}

          {step < 6 && (
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance()}
              className="group relative ml-auto overflow-hidden rounded-lg bg-gradient-to-br from-gold via-gold to-gold/85 px-7 py-3.5 text-sm font-extrabold text-foreground shadow-[0_8px_28px_-6px_hsl(var(--gold)/0.55)] transition-all hover:shadow-[0_14px_36px_-6px_hsl(var(--gold)/0.75)] hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100"
              />
              <span className="relative">
                {customQuote && step === 5 ? 'Get My Plan →' : stepInfo.cta}
              </span>
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
