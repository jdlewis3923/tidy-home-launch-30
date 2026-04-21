/**
 * Tidy — Promo Code Capture
 *
 * Session-scoped promo code capture. Handles:
 *   (a) per-customer referral codes (post-launch)
 *   (b) FOUNDING50 founding-member offer (pre-launch)
 *   (c) any future one-off codes
 *
 * Storage is intentionally sessionStorage (not localStorage) so codes
 * don't leak across browser sessions.
 *
 * Rules:
 *   - First URL-captured code wins per session (later ?promo=... is ignored).
 *   - Manual entry on the cart screen ALWAYS overwrites.
 *   - Dismissing the banner does NOT clear the code — it stays applied at checkout.
 *   - On successful checkout redirect, all promo keys are cleared.
 */

export const PROMO_KEY = 'tidy_promo_code';
export const PROMO_TS_KEY = 'tidy_promo_code_ts';
export const PROMO_DISMISSED_KEY = 'tidy_promo_code_dismissed';

const isBrowser = () => typeof window !== 'undefined' && !!window.sessionStorage;

/** Read the active promo code, if any. */
export function getPromoCode(): string | null {
  if (!isBrowser()) return null;
  return sessionStorage.getItem(PROMO_KEY);
}

/** True if the captured-banner has been dismissed for this session. */
export function isPromoBannerDismissed(): boolean {
  if (!isBrowser()) return false;
  return sessionStorage.getItem(PROMO_DISMISSED_KEY) === 'true';
}

/**
 * Capture a promo code from the URL.
 * First-wins: if a code is already stored, this is a no-op.
 */
export function capturePromoFromUrl(): void {
  if (!isBrowser()) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('promo');
    if (!raw) return;
    const code = raw.trim().toUpperCase();
    if (!code) return;
    if (sessionStorage.getItem(PROMO_KEY)) return; // first-wins
    sessionStorage.setItem(PROMO_KEY, code);
    sessionStorage.setItem(PROMO_TS_KEY, new Date().toISOString());
  } catch {
    /* sessionStorage unavailable — silently ignore */
  }
}

/**
 * Manual entry from the cart "Have a promo code?" input.
 * Overwrites any existing code and re-shows the banner.
 */
export function setPromoCodeManual(raw: string): string | null {
  if (!isBrowser()) return null;
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  sessionStorage.setItem(PROMO_KEY, code);
  sessionStorage.setItem(PROMO_TS_KEY, new Date().toISOString());
  sessionStorage.removeItem(PROMO_DISMISSED_KEY);
  // Notify any mounted listeners (banner) to re-read.
  window.dispatchEvent(new Event('tidy:promo-changed'));
  return code;
}

/** Hide the banner for the rest of the session. Does NOT clear the code. */
export function dismissPromoBanner(): void {
  if (!isBrowser()) return;
  sessionStorage.setItem(PROMO_DISMISSED_KEY, 'true');
  window.dispatchEvent(new Event('tidy:promo-changed'));
}

/** Clear all promo state — call right before redirecting to Stripe Checkout. */
export function clearPromo(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(PROMO_KEY);
  sessionStorage.removeItem(PROMO_TS_KEY);
  sessionStorage.removeItem(PROMO_DISMISSED_KEY);
  window.dispatchEvent(new Event('tidy:promo-changed'));
}
