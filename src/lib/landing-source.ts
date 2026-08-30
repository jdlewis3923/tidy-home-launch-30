/**
 * Door-hanger response attribution.
 *
 * The 14,000-piece run is printed two-sided and both panels show the same URL,
 * jointidy.co/neighbor. The QR code on the Spanish panel encodes ?lang=es, so
 * that param is the only signal separating a Spanish-panel scan from an
 * English-panel one — record it with the signup.
 *
 * First-wins, 90-day window, mirroring src/lib/utm.ts. The value rides into
 * /signup as `src=` and is written onto the Stripe subscription metadata by the
 * checkout functions, so the split survives the whole redirect chain.
 */

export type LandingSource = "doorhanger_en" | "doorhanger_es" | "doorhanger";

const LANDING_SOURCE_VALUES: readonly string[] = ["doorhanger_en", "doorhanger_es", "doorhanger"];

export type QrPlacementValue = "hero" | "card" | "unknown";
const PLACEMENT_KEY = "tidy_qr_placement";
const ZIP_KEY = "tidy_qr_zip";

export const LANDING_SOURCES: Record<"en" | "es", LandingSource> = {
  en: "doorhanger_en",
  es: "doorhanger_es",
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
    if (typeof parsed?.v === "string" && LANDING_SOURCE_VALUES.includes(parsed.v)) {
      return parsed.v as LandingSource;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pick the source back up off the URL (`?src=doorhanger_es`) so it survives a
 * shared link or a return visit that skips the landing page itself.
 */
export function captureLandingSourceFromUrl(): void {
  if (!isBrowser()) return;
  const params = new URLSearchParams(window.location.search);
  const v = params.get("src");
  if (v && LANDING_SOURCE_VALUES.includes(v)) captureLandingSource(v as LandingSource);
  // Placement is deliberately SEPARATE from source: hero = scanned off the
  // door, card = kept the tear-off and scanned later. Different intents.
  const placement = params.get("placement");
  if (placement === "hero" || placement === "card" || placement === "unknown") {
    captureFirstWins(PLACEMENT_KEY, placement);
  }
  const zip = params.get("zip");
  if (zip && /^\d{5}$/.test(zip)) captureFirstWins(ZIP_KEY, zip);
}

/** First-wins write for the simple string attribution keys. */
function captureFirstWins(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    if (window.localStorage?.getItem(key)) return;
    window.localStorage?.setItem(key, JSON.stringify({ v: value, ts: Date.now() }));
  } catch { /* storage unavailable */ }
}

function readFirstWins(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: string; ts?: number };
    if (typeof parsed?.ts === "number" && Date.now() - parsed.ts > TTL_MS) {
      window.localStorage?.removeItem(key);
      return null;
    }
    return typeof parsed?.v === "string" ? parsed.v : null;
  } catch {
    return null;
  }
}

/** hero | card | unknown — which panel of the print run was scanned. */
export function getQrPlacement(): QrPlacementValue | null {
  const v = readFirstWins(PLACEMENT_KEY);
  return v === "hero" || v === "card" || v === "unknown" ? v : null;
}

/** The ZIP printed on the scanned hanger, independent of the ZIP typed later. */
export function getQrZip(): string | null {
  return readFirstWins(ZIP_KEY);
}

export function clearLandingSource(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage?.removeItem(STORAGE_KEY);
    window.localStorage?.removeItem(PLACEMENT_KEY);
    window.localStorage?.removeItem(ZIP_KEY);
  } catch {
    /* ignore */
  }
}
