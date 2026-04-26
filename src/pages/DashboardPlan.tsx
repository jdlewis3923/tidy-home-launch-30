import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ConfigState, ServiceType, Frequency, loadState, saveState, clearState, hasCustomQuote } from '@/lib/dashboard-pricing';
import CalmShell from '@/components/dashboard/CalmShell';
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

// Quiet, lowercase Apple-tone microcopy. The headline does the lifting,
// the subline is one short line — never two.
const STEPS = [
  { heading: 'what should we handle?',          sub: 'one, two, or all three. bundle to save.',          cta: 'continue',     micro: 'set it once.' },
  { heading: 'how often?',                      sub: 'change anytime. no lock-in.',                      cta: 'continue',     micro: 'set it once.' },
  { heading: 'tell us about your home',         sub: 'so we match the right pro and the right price.',  cta: 'continue',     micro: 'set it once.' },
  { heading: "we'll take it from here",         sub: 'name, address, how to get in.',                    cta: 'continue',     micro: 'set it once.' },
  { heading: 'anything extra this first visit?', sub: 'one-time. add only what you want.',                cta: 'review',       micro: 'set it once.', skip: 'no thanks — review →' },
  { heading: 'your home, handled.',             sub: 'review your plan before we begin.',                cta: 'looks right',  micro: 'almost done.' },
  { heading: "you're all set.",                 sub: 'secure checkout · cancel anytime.',                cta: 'confirm subscription', micro: 'final step.' },
];

const SERVICE_PARAM_MAP: Record<string, ServiceType> = {
  cleaning: 'cleaning', lawn: 'lawn', detailing: 'detailing',
};
const PLAN_PARAM_MAP: Record<string, Frequency> = {
  monthly: 'monthly', biweekly: 'biweekly', weekly: 'weekly', full: 'biweekly',
};

export default function DashboardPlan() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ConfigState>(loadState);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const customQuote = hasCustomQuote(state);

  // Preselect from incoming ad URL params, once.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const serviceParam = params.get('service');
    const planParam = params.get('plan');
    const servicesParam = params.get('services');
    const bundleParam = params.get('bundle');
    if (!serviceParam && !bundleParam && !servicesParam) return;

    setState((prev) => {
      const next: ConfigState = { ...prev, frequencies: { ...prev.frequencies } };
      if (servicesParam) {
        const slugs = servicesParam.split(',').map(s => s.trim().toLowerCase())
          .filter((s): s is keyof typeof SERVICE_PARAM_MAP => s in SERVICE_PARAM_MAP)
          .map((s) => SERVICE_PARAM_MAP[s]);
        if (slugs.length) {
          next.services = Array.from(new Set([...prev.services, ...slugs]));
          for (const svc of slugs) {
            if (!next.frequencies[svc]) next.frequencies[svc] = svc === 'lawn' ? 'monthly' : 'biweekly';
          }
        }
      }
      if (serviceParam && SERVICE_PARAM_MAP[serviceParam]) {
        const svc = SERVICE_PARAM_MAP[serviceParam];
        if (!next.services.includes(svc)) next.services = [...next.services, svc];
        const planFreq = planParam && PLAN_PARAM_MAP[planParam];
        if (planFreq) {
          next.frequencies[svc] = svc === 'detailing' && planFreq === 'weekly' ? 'biweekly' : planFreq;
        } else if (!next.frequencies[svc]) {
          next.frequencies[svc] = svc === 'lawn' ? 'monthly' : 'biweekly';
        }
      }
      saveState(next);
      return next;
    });
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
    if (step === 5 && customQuote) { setQuoteOpen(true); return; }
    if (step < STEPS.length - 1) setStep(step + 1);
    else { clearState(); navigate('/dashboard/confirmation'); }
  };

  const back = () => { if (step > 0) setStep(step - 1); };

  const stepInfo = STEPS[step];

  return (
    <CalmShell step={step} totalSteps={STEPS.length} microcopy={stepInfo.micro}>
      <div className="space-y-6">
        <ProgressBar currentStep={step} totalSteps={STEPS.length} />
        <PromoBanner />

        <div className="animate-calm-in" key={`heading-${step}`}>
          <h1
            className="text-3xl md:text-[34px] font-bold text-ink lowercase"
            style={{ letterSpacing: '-0.025em', lineHeight: 1.05 }}
          >
            {stepInfo.heading}
          </h1>
          <p className="mt-2 text-sm text-ink-faint lowercase">{stepInfo.sub}</p>
        </div>

        {step <= 1 && <ExistingAccountInline />}

        <div key={`step-${step}`} className="animate-calm-in">
          {step === 0 && <StepServices  state={state} onChange={updateState} />}
          {step === 1 && <StepFrequency state={state} onChange={updateState} />}
          {step === 2 && <StepProperty  state={state} onChange={updateState} />}
          {step === 3 && <StepDetails   state={state} onChange={updateState} />}
          {step === 4 && <StepAddOns    state={state} onChange={updateState} />}
          {step === 5 && <StepReview    state={state} onEdit={() => setStep(0)} />}
          {step === 6 && <StepPayment   state={state} onChange={updateState} />}
        </div>

        {(step === 5 || step === 6) && customQuote && (
          <div className="rounded-xl border border-hairline bg-white/70 p-4 text-sm text-ink-soft animate-calm-in">
            <p className="font-semibold mb-1 text-ink">custom plan required</p>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              we'll create a plan tailored to your home — no payment today. tap "get my plan" and we'll reach out shortly.
            </p>
          </div>
        )}

        {/* Navigation — calm, ink-on-cream */}
        {step < 6 && (
          <div className="flex items-center gap-3 pt-2">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="text-sm font-medium text-ink-faint hover:text-ink transition-colors"
              >
                ← back
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                onClick={next}
                className="text-sm font-medium text-ink-faint hover:text-ink transition-colors"
              >
                {stepInfo.skip}
              </button>
            )}

            <button
              type="button"
              onClick={next}
              disabled={!canAdvance()}
              className="ml-auto group relative overflow-hidden rounded-xl bg-ink px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_hsl(var(--ink)/0.5)] transition-all hover:shadow-[0_18px_40px_-12px_hsl(var(--ink)/0.6)] hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 lowercase"
            >
              <span className="relative inline-flex items-center gap-1.5">
                {customQuote && step === 5 ? 'get my plan' : stepInfo.cta}
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </button>
          </div>
        )}
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
    </CalmShell>
  );
}
