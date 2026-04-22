/**
 * Helpers for the Google-Ads landing pages (/house-cleaning, /lawn-care,
 * /car-detailing, /bundle). Centralises constants so all 4 pages stay in lockstep.
 */

export const PHONE_DISPLAY = "(786) 829-1141";
export const PHONE_TEL = "+17868291141";

// Service area — exact list, no other ZIPs.
export const SERVICE_ZIPS = ["33156", "33183", "33186"] as const;
export const SERVICE_AREA_TEXT = "Pinecrest + Kendall — Miami-Dade";
export const SERVICE_AREA_TRUST = `Serving ${SERVICE_ZIPS.join(" · ")}`;

// UTM params we forward end-to-end.
export const FORWARDED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "promo",
] as const;

/**
 * Build a URL with the page's incoming UTM/promo/gclid params merged in.
 * Page-specific overrides (service, plan, bundle, services) win.
 */
export function buildSignupHref(
  search: string,
  overrides: Record<string, string | undefined> = {}
): string {
  const incoming = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const v = incoming.get(key);
    if (v) out.set(key, v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined && v !== null && v !== "") out.set(k, v);
  }
  const qs = out.toString();
  return qs ? `/signup?${qs}` : "/signup";
}
