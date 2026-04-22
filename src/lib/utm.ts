/**
 * UTM + gclid capture, mirrored on the same first-wins / session-scoped
 * pattern as src/lib/promo.ts. Captured at every route change in App.tsx.
 *
 * Persists into sessionStorage so:
 *   - /house-cleaning?utm_source=google → /signup → Stripe metadata
 * survives the redirect chain even if the user lingers on the dashboard
 * builder for several minutes.
 */

const KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
] as const;

export type UtmKey = (typeof KEYS)[number];

const STORAGE_PREFIX = "tidy_attr_";
const isBrowser = () =>
  typeof window !== "undefined" && !!window.sessionStorage;

/** First-wins capture from the current URL. */
export function captureUtmFromUrl(): void {
  if (!isBrowser()) return;
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of KEYS) {
      const v = params.get(key);
      if (!v) continue;
      const storageKey = STORAGE_PREFIX + key;
      if (sessionStorage.getItem(storageKey)) continue; // first-wins
      sessionStorage.setItem(storageKey, v.trim());
    }
  } catch {
    /* sessionStorage unavailable — silently ignore */
  }
}

/** Read all currently-stored attribution params. */
export function getUtmAttribution(): Partial<Record<UtmKey, string>> {
  if (!isBrowser()) return {};
  const out: Partial<Record<UtmKey, string>> = {};
  for (const key of KEYS) {
    const v = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (v) out[key] = v;
  }
  return out;
}

/** Clear all captured attribution — typically right after Stripe redirect. */
export function clearUtmAttribution(): void {
  if (!isBrowser()) return;
  for (const key of KEYS) {
    sessionStorage.removeItem(STORAGE_PREFIX + key);
  }
}
