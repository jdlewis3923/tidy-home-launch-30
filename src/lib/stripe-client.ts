/**
 * Tidy — Stripe.js singleton loader.
 *
 * Lazily loads Stripe.js on the client only after the user reaches the
 * payment step (avoids a 100kb+ blocking script on landing pages).
 *
 * Returns `null` when VITE_STRIPE_PUBLISHABLE_KEY is missing — callers
 * use this to fall back to legacy redirect Checkout so the app never
 * white-screens before the key is configured.
 */
import { loadStripe, type Stripe } from '@stripe/stripe-js';

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

let cached: Promise<Stripe | null> | null = null;

/** 'test' | 'live' | null — read from the publishable key prefix. */
export function publishableKeyMode(): 'test' | 'live' | null {
  if (!PUBLISHABLE_KEY) return null;
  if (PUBLISHABLE_KEY.startsWith('pk_test_')) return 'test';
  if (PUBLISHABLE_KEY.startsWith('pk_live_')) return 'live';
  return null;
}

/**
 * True when the page's publishable key is in a different Stripe environment
 * than the server. Confirming a live PaymentIntent with pk_test Stripe.js
 * always fails, so the caller must fall back to hosted Checkout instead.
 */
export function stripeModeMismatch(serverMode: string | null | undefined): boolean {
  if (!serverMode) return false;
  const clientMode = publishableKeyMode();
  if (!clientMode) return true;
  return clientMode !== serverMode;
}

export function getStripe(): Promise<Stripe | null> | null {
  if (!PUBLISHABLE_KEY) return null;
  if (!cached) cached = loadStripe(PUBLISHABLE_KEY);
  return cached;
}

export function isEmbeddedCheckoutAvailable(): boolean {
  return publishableKeyMode() !== null;
}

