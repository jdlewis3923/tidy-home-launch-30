import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfigState, ServiceType, Frequency, loadState, saveState, clearState, hasCustomQuote, VALID_ZIPS } from '@/lib/dashboard-pricing';
import CalmShell from '@/components/dashboard/CalmShell';
import ProgressBar from '@/components/dashboard/ProgressBar';
import StickyPriceBar from '@/components/dashboard/StickyPriceBar';
import StepZipGate from '@/components/dashboard/StepZipGate';
import StepServices from '@/components/dashboard/steps/StepServices';
import StepFrequency from '@/components/dashboard/steps/StepFrequency';
import StepProperty from '@/components/dashboard/steps/StepProperty';
import StepDetails from '@/components/dashboard/steps/StepDetails';
import StepAddOns from '@/components/dashboard/steps/StepAddOns';
import StepReview from '@/components/dashboard/steps/StepReview';
import StepPayment from '@/components/dashboard/steps/StepPayment';
import PromoBanner from '@/components/dashboard/PromoBanner';
import TrustStrip from '@/components/dashboard/TrustStrip';
import BundleNudge from '@/components/dashboard/BundleNudge';
import CustomQuoteModal from '@/components/dashboard/CustomQuoteModal';
import ExistingAccountInline from '@/components/dashboard/ExistingAccountInline';

// Quiet, lowercase Apple-tone microcopy. Step 0 is the new ZIP gate.
const STEPS = [
  { heading: 'first — where do you live?',      sub: "we'll confirm we're in your area before anything else.", cta: '',             micro: 'set it once.' },
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
  const [direction, setDirection] = useState(0);
  const [state, setState] = useState<ConfigState>(loadState);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const customQuote = hasCustomQuote(state);

  // Preselect from incoming ad URL params, once. If a valid ZIP is in
  // localStorage already, skip the ZIP gate.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const serviceParam = params.get('service');
    const planParam = params.get('plan');
    const servicesParam = params.get('services');
    const bundleParam = params.get('bundle');

    // Skip ZIP gate if user already has a valid in-area zip stored.
    if (state.zip && VALID_ZIPS.includes(state.zip)) {
      setStep(1);
    }

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
    if (step === 0) return false; // gate has its own submit
    if (step === 1) return state.services.length > 0;
    if (step === 2) return state.services.every(s => !!state.frequencies[s]);
    if (step === 3) {
      if (state.services.includes('cleaning') && !state.homeSize) return false;
      if (state.services.includes('lawn') && !state.yardSize) return false;
      if (state.services.includes('detailing') && !state.vehicleSize) return false;
      return true;
    }
    if (step === 4) return !!(state.firstName && state.lastName && state.email && state.password && state.password.length >= 8 && state.phone && state.address && state.city && state.zip);
    return true;
  };

  const next = () => {
    if (step === 6 && customQuote) { setQuoteOpen(true); return; }
    if (step < STEPS.length - 1) {
      setDirection(1);
      setStep(step + 1);
    }
    else { clearState(); navigate('/dashboard/confirmation'); }
  };

  const back = () => {
    if (step > 0) {
      setDirection(-1);
      setStep(step - 1);
    }
  };

  const stepInfo = STEPS[step];

  return (
    <CalmShell step={step} totalSteps={STEPS.length} microcopy={stepInfo.micro}>
      <div className="space-y-6">
        <ProgressBar currentStep={step} totalSteps={STEPS.length} />

        {/* Above-the-fold trust strip — visible on every step. */}
        <TrustStrip />

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

        {step >= 1 && step <= 2 && <ExistingAccountInline />}

        <div className="relative overflow-x-hidden">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={`step-${step}`}
              custom={direction}
              initial={{ opacity: 0, x: direction === 0 ? 0 : direction * 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -32 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            >
              {step === 0 && (
                <StepZipGate
                  state={state}
                  onChange={updateState}
                  onValid={() => { setDirection(1); setStep(1); }}
                />
              )}
              {step === 1 && (
                <div className="space-y-4">
                  <StepServices state={state} onChange={updateState} />
                  <BundleNudge state={state} onChange={updateState} />
                </div>
              )}
              {step === 2 && <StepFrequency state={state} onChange={updateState} />}
              {step === 3 && <StepProperty  state={state} onChange={updateState} />}
              {step === 4 && <StepDetails   state={state} onChange={updateState} />}
              {step === 5 && <StepAddOns    state={state} onChange={updateState} />}
              {step === 6 && <StepReview    state={state} onEdit={() => { setDirection(-1); setStep(1); }} />}
              {step === 7 && <StepPayment   state={state} onChange={updateState} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {(step === 6 || step === 7) && customQuote && (
          <div className="rounded-xl border border-hairline bg-white/70 p-4 text-sm text-ink-soft animate-calm-in">
            <p className="font-semibold mb-1 text-ink">custom plan required</p>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              we'll create a plan tailored to your home — no payment today. tap "get my plan" and we'll reach out shortly.
            </p>
          </div>
        )}

        {/* Navigation — calm, ink-on-cream. ZIP gate (step 0) handles its own submit. */}
        {step > 0 && step < 7 && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={back}
              className="text-sm font-medium text-ink-faint hover:text-ink transition-colors"
              style={{ minHeight: 44 }}
            >
              ← back
            </button>

            {step === 5 && (
              <button
                type="button"
                onClick={next}
                className="text-sm font-medium text-ink-faint hover:text-ink transition-colors"
                style={{ minHeight: 44 }}
              >
                {stepInfo.skip}
              </button>
            )}

            <button
              type="button"
              onClick={next}
              disabled={!canAdvance()}
              style={{ backgroundColor: 'hsl(var(--ink))', color: '#ffffff', minHeight: 44 }}
              className="ml-auto group relative overflow-hidden rounded-xl px-7 py-3.5 text-sm font-semibold shadow-[0_12px_32px_-10px_hsl(var(--ink)/0.55)] ring-1 ring-[hsl(var(--ink))] transition-all hover:shadow-[0_20px_44px_-10px_hsl(var(--ink)/0.7)] hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 lowercase"
            >
              <span className="relative inline-flex items-center gap-1.5">
                {customQuote && step === 6 ? 'get my plan' : stepInfo.cta}
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </button>
          </div>
        )}

        {/* Back button on payment step (no advance — payment form handles it). */}
        {step === 7 && (
          <div className="flex items-center pt-2">
            <button
              type="button"
              onClick={back}
              className="text-sm font-medium text-ink-faint hover:text-ink transition-colors"
              style={{ minHeight: 44 }}
            >
              ← back
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
