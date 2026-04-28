/**
 * /welcome — Branded post-payment landing.
 *
 * Stripe redirects here after the embedded Payment Element confirms.
 * Stripe appends ?payment_intent=... and ?payment_intent_client_secret=...
 * which we use to verify status (UI feedback only — actual fulfillment
 * happens server-side via stripe-webhook).
 *
 * Replaces the old /checkout/success destination for the embedded flow.
 * Tone: calm, confident, on-brand. No "checkout success" framing — the
 * customer just joined Tidy.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sparkles, Calendar, CheckCircle2 } from 'lucide-react';
import { pushEvent } from '@/lib/tracking';
import { clearPromo } from '@/lib/promo';
import { CUSTOMER_ACCOUNT_ENABLED } from '@/lib/dashboard-config';
import { getStripe } from '@/lib/stripe-client';

type Status = 'verifying' | 'succeeded' | 'processing' | 'failed';

export default function Welcome() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status>('verifying');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    clearPromo();
    const clientSecret = params.get('payment_intent_client_secret');
    const piId = params.get('payment_intent');
    pushEvent('welcome_view', { payment_intent: piId ?? null });

    const stripeP = getStripe();
    if (!clientSecret || !stripeP) {
      // Direct nav or missing key — assume success (webhook is source of truth).
      setStatus('succeeded');
      return;
    }
    stripeP.then((stripe) => {
      if (!stripe) { setStatus('succeeded'); return; }
      stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
        if (!paymentIntent) { setStatus('succeeded'); return; }
        switch (paymentIntent.status) {
          case 'succeeded':
            setStatus('succeeded');
            pushEvent('subscription_payment_succeeded', { payment_intent: paymentIntent.id });
            break;
          case 'processing':
            setStatus('processing');
            break;
          case 'requires_payment_method':
          case 'requires_action':
          case 'requires_confirmation':
            setStatus('failed');
            setErrMsg('your payment didn\'t go through. please try a different card.');
            break;
          default:
            setStatus('succeeded');
        }
      });
    });
  }, [params]);

  const ctaTo = CUSTOMER_ACCOUNT_ENABLED ? '/dashboard' : '/';
  const ctaLabel = CUSTOMER_ACCOUNT_ENABLED ? 'go to your dashboard' : 'back to home';

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-2xl px-6 py-20">
        {status === 'failed' ? (
          <div className="rounded-3xl border border-destructive/30 bg-white p-10 text-center shadow-[0_14px_40px_-16px_hsl(var(--ink)/0.18)]">
            <h1 className="text-3xl font-bold text-ink lowercase tracking-tight" style={{ letterSpacing: '-0.03em' }}>
              payment didn't go through
            </h1>
            <p className="mt-3 text-ink-soft">{errMsg ?? 'please try a different payment method.'}</p>
            <Link to="/dashboard/plan" className="mt-6 inline-block rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-white hover:bg-ink-soft transition">
              try again
            </Link>
          </div>
        ) : (
          <div className="rounded-3xl border border-hairline bg-white p-10 shadow-[0_14px_40px_-16px_hsl(var(--ink)/0.18)] text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50">
              {status === 'verifying' || status === 'processing' ? (
                <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-600" />
              ) : (
                <CheckCircle2 className="h-9 w-9 text-emerald-600" strokeWidth={2.25} />
              )}
            </div>

            <h1 className="mt-6 text-4xl font-bold text-ink lowercase tracking-tight" style={{ letterSpacing: '-0.03em' }}>
              welcome to tidy.
            </h1>
            <p className="mt-3 text-ink-soft">
              {status === 'processing'
                ? 'your bank is finishing up — we\'ll email you the moment it confirms.'
                : 'your subscription is live. one less thing on your plate.'}
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
              <div className="rounded-2xl border border-hairline bg-cream/40 p-4">
                <Sparkles className="h-5 w-5 text-[hsl(var(--primary))]" />
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">first up</p>
                <p className="mt-1 text-sm text-ink">we'll confirm your first visit by text within an hour.</p>
              </div>
              <div className="rounded-2xl border border-hairline bg-cream/40 p-4">
                <Calendar className="h-5 w-5 text-[hsl(var(--primary))]" />
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">your schedule</p>
                <p className="mt-1 text-sm text-ink">manage, pause, or reschedule any time from your dashboard.</p>
              </div>
              <div className="rounded-2xl border border-hairline bg-cream/40 p-4">
                <CheckCircle2 className="h-5 w-5 text-[hsl(var(--primary))]" />
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">receipt</p>
                <p className="mt-1 text-sm text-ink">on its way to your inbox now.</p>
              </div>
            </div>

            <Link
              to={ctaTo}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-7 py-4 text-sm font-semibold text-white shadow-[0_14px_40px_-12px_hsl(var(--ink)/0.5)] hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-12px_hsl(var(--ink)/0.6)] transition lowercase"
              style={{ letterSpacing: '-0.005em' }}
            >
              {ctaLabel} →
            </Link>

            <p className="mt-6 text-xs text-ink-faint lowercase">questions? reply to any tidy text and a human responds.</p>
          </div>
        )}
      </div>
    </div>
  );
}
