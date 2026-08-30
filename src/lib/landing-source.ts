/**
 * Door-hanger response attribution.
 *
 * The 14,000-piece run is printed two-sided: the English tear-off points at
 * /neighbor, the Spanish one at /vecino. Both land on the same founding offer,
 * so the only way to know whether the Spanish half pulls its weight is to
 * record WHICH door the signup walked through.
 *
 * First-wins, 90-day window, mirroring src/lib/utm.ts. The value rides into
 * /signup as `src=` and is written onto the Stripe subscription metadata by the
 * checkout functions, so the split survives the whole redirect chain.
 */

export type LandingSource = "doorhanger_en" | "doorhanger_es";

export const LANDING_SOURCES: Record<"neighbor" | "vecino", LandingSource> = {
  neighbor: "doorhanger_en",
  vecino: "doorhanger_es",
};

const STORAGE_KEY = "tidy_landing_source";
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

const isBrowser = () => typeof window !== "undefined";

/** Record the landing source. First-wins inside the 90-day window. */
export function captureLandingSource(source: LandingSource): void {
  if (!isBrowser()) return;
  if (getLandingSource()) return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ v: source, ts: Date.now() }));
  } catch {
    /* storage unavailable — the URL param and the GTM event still carry it */
  }
}

/** Read the stored landing source, or null once the window has lapsed. */
export function getLandingSource(): LandingSource | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: string; ts?: number };
    if (typeof parsed?.ts === "number" && Date.now() - parsed.ts > TTL_MS) {
      window.localStorage?.removeItem(STORAGE_KEY);
      return null;
    }
    if (parsed?.v === "doorhanger_en" || parsed?.v === "doorhanger_es") return parsed.v;
    return null;
  } catch {
    return null;
  }
}

export function clearLandingSource(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
