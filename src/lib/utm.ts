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
/** Attribution window: 90 days, matching the ad platforms' lookback. */
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

const isBrowser = () => typeof window !== "undefined";

/**
 * Values are stored in localStorage as JSON `{ v, ts }` so they survive a
 * closed tab and expire after 90 days. Legacy plain-string values (and any
 * value still in sessionStorage) are read as a fallback.
 */
function readOne(key: UtmKey): string | null {
  const storageKey = STORAGE_PREFIX + key;
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { v?: string; ts?: number };
        if (parsed && typeof parsed.v === "string") {
          if (typeof parsed.ts === "number" && Date.now() - parsed.ts > TTL_MS) {
            window.localStorage.removeItem(storageKey);
          } else {
            return parsed.v;
          }
        }
      } catch {
        return raw; // legacy plain string
      }
    }
  } catch {
    /* localStorage unavailable */
  }
  try {
    return window.sessionStorage?.getItem(storageKey) ?? null;
  } catch {
    return null;
  }
}

function writeOne(key: UtmKey, value: string): void {
  const storageKey = STORAGE_PREFIX + key;
  try {
    window.localStorage?.setItem(storageKey, JSON.stringify({ v: value, ts: Date.now() }));
  } catch {
    try {
      window.sessionStorage?.setItem(storageKey, value);
    } catch {
      /* storage unavailable — silently ignore */
    }
  }
}

/** First-wins capture from the current URL. */
export function captureUtmFromUrl(): void {
  if (!isBrowser()) return;
  const params = new URLSearchParams(window.location.search);
  for (const key of KEYS) {
    const v = params.get(key);
    if (!v) continue;
    if (readOne(key)) continue; // first-wins (within the 90-day window)
    writeOne(key, v.trim());
  }
}

/** Read all currently-stored attribution params. */
export function getUtmAttribution(): Partial<Record<UtmKey, string>> {
  if (!isBrowser()) return {};
  const out: Partial<Record<UtmKey, string>> = {};
  for (const key of KEYS) {
    const v = readOne(key);
    if (v) out[key] = v;
  }
  return out;
}

/** Clear all captured attribution — typically right after Stripe redirect. */
export function clearUtmAttribution(): void {
  if (!isBrowser()) return;
  for (const key of KEYS) {
    try {
      window.localStorage?.removeItem(STORAGE_PREFIX + key);
    } catch { /* ignore */ }
    try {
      window.sessionStorage?.removeItem(STORAGE_PREFIX + key);
    } catch { /* ignore */ }
  }
}
