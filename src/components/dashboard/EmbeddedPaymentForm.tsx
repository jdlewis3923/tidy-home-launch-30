/**
 * EmbeddedPaymentForm — Stripe Payment Element rendered inline.
 *
 * Mounted only after the parent fetches a SetupIntent/Subscription
 * client_secret from `create-stripe-payment-intent`. On confirm,
 * Stripe handles 3DS challenges in-iframe (no redirect away from
 * jointidy.co), then routes to /welcome on success.
 *
 * Visually consistent with the calm StepPayment surface — plain card,
 * cream paper, ink CTA. Stripe's appearance API matches our design
 * tokens so the form doesn't look bolted on.
 */
import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { Stripe, StripeElementsOptions } from '@stripe/stripe-js';
import { Lock } from 'lucide-react';

interface Props {
  stripe: Promise<Stripe | null>;
  clientSecret: string;
  returnUrl: string;
  onError?: (msg: string) => void;
}

const APPEARANCE: StripeElementsOptions['appearance'] = {
  theme: 'flat',
  variables: {
    colorPrimary: '#0F172A',
    colorBackground: '#FFFFFF',
    colorText: '#0F172A',
    colorTextSecondary: '#475569',
    colorDanger: '#DC2626',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    spacingUnit: '4px',
    borderRadius: '10px',
  },
  rules: {
    '.Input': {
      border: '1px solid hsl(214 32% 91%)',
      boxShadow: 'none',
      padding: '12px',
    },
    '.Input:focus': {
      border: '1px solid #0F172A',
      boxShadow: '0 0 0 3px rgba(15,23,42,0.08)',
    },
    '.Label': {
      fontSize: '12px',
      fontWeight: '500',
      textTransform: 'lowercase',
      letterSpacing: '0.02em',
    },
  },
};

function PayInner({ returnUrl, onError }: { returnUrl: string; onError?: (msg: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    // If we get here, an error happened (success → redirect to return_url).
    if (error) {
      onError?.(error.message ?? 'payment could not be confirmed.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="group relative w-full overflow-hidden rounded-xl bg-ink px-6 py-5 text-base font-semibold text-white shadow-[0_14px_40px_-12px_hsl(var(--ink)/0.5)] transition-all duration-300 hover:shadow-[0_22px_48px_-12px_hsl(var(--ink)/0.6)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        style={{ letterSpacing: '-0.005em' }}
      >
        <span className="relative inline-flex items-center justify-center gap-2 lowercase">
          {submitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              confirming…
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" strokeWidth={2.25} />
              pay & start subscription
            </>
          )}
        </span>
      </button>
    </form>
  );
}

export default function EmbeddedPaymentForm({ stripe, clientSecret, returnUrl, onError }: Props) {
  const options: StripeElementsOptions = {
    clientSecret,
    appearance: APPEARANCE,
    loader: 'auto',
  };

  return (
    <div className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_8px_32px_-16px_hsl(var(--ink)/0.18)]">
      <Elements stripe={stripe} options={options}>
        <PayInner returnUrl={returnUrl} onError={onError} />
      </Elements>
    </div>
  );
}
