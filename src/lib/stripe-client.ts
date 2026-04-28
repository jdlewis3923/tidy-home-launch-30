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

export function getStripe(): Promise<Stripe | null> | null {
  if (!PUBLISHABLE_KEY) return null;
  if (!cached) cached = loadStripe(PUBLISHABLE_KEY);
  return cached;
}

export function isEmbeddedCheckoutAvailable(): boolean {
  return Boolean(PUBLISHABLE_KEY);
}
