/**
 * Door-hanger funnel routing.
 *
 * A door-hanger scan lands on /q/<code> → /neighbor?src=doorhanger_*&zip=&lang=
 * and the CTA there goes to /signup → /dashboard/plan. A visitor arriving at the
 * plan builder straight off a hanger should see the founding offer FIRST, which
 * is what the redirect below does — but it must release them once they have seen
 * it, otherwise /neighbor → /signup → /dashboard/plan → /neighbor loops forever.
 *
 * Two independent releases:
 *   1. `offer=seen`, added by the /neighbor CTA and forwarded through /signup.
 *   2. a session marker, in case the param is dropped by anything downstream.
 *
 * `offer` is a ROUTING flag only. It is deliberately not written to
 * landing_touches and not sent to Stripe metadata.
 */

export const OFFER_SEEN_PARAM = "offer";
export const OFFER_SEEN_VALUE = "seen";
export const OFFER_SESSION_KEY = "tidy_offer_shown";

export function hasSeenFoundingOfferThisSession(): boolean {
  try {
    return sessionStorage.getItem(OFFER_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markFoundingOfferShown(): void {
  try {
    sessionStorage.setItem(OFFER_SESSION_KEY, "1");
  } catch {
    /* private mode — the offer=seen param is the primary guard anyway */
  }
}

/**
 * True when a door-hanger visitor at /dashboard/plan should be bounced to the
 * founding-offer page first. Pure so it can be tested without a router.
 */
export function shouldRedirectToFoundingOffer(
  pathname: string,
  search: string,
  sessionSeen = false
): boolean {
  if (pathname !== "/dashboard/plan") return false;
  if (sessionSeen) return false;
  const params = new URLSearchParams(search);
  const src = params.get("src") ?? "";
  if (!src.startsWith("doorhanger")) return false;
  return params.get(OFFER_SEEN_PARAM) !== OFFER_SEEN_VALUE;
}
