// Tidy — Shared Stripe key validation helpers
//
// Centralized so every edge function rejects malformed or placeholder keys
// before calling Stripe's API. Prevents silent 401s caused by mis-pasted
// mk_ / pk_ / whsec_ / restricted keys being used where a full secret key
// is required.

const STRIPE_SECRET_KEY_RE = /^sk_(live|test)_[A-Za-z0-9]{24,}$/;

/** Returns true only for a well-formed Stripe secret key (sk_live_… or sk_test_…). */
export function isValidStripeSecretKey(key: string | null | undefined): boolean {
  if (!key || typeof key !== 'string') return false;
  return STRIPE_SECRET_KEY_RE.test(key.trim());
}

/** Human-readable error when a key is missing or malformed. */
export function stripeSecretKeyError(name = 'STRIPE_CONNECT_API_KEY'): { ok: false; reason: string } {
  return {
    ok: false,
    reason: `${name} must be a Stripe secret key starting with sk_live_ or sk_test_ (e.g. sk_live_…). Publishable, restricted, webhook, and malformed keys are not accepted.`,
  };
}
