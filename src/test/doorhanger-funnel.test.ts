import { describe, it, expect } from "vitest";
import { shouldRedirectToFoundingOffer, OFFER_SEEN_PARAM, OFFER_SEEN_VALUE } from "@/lib/doorhanger";
import { buildSignupHref } from "@/lib/landing";

// The /neighbor CTA, reproduced: every incoming param plus offer=seen.
const neighborCtaHref = (search: string) =>
  buildSignupHref(search, { src: "doorhanger_en", [OFFER_SEEN_PARAM]: OFFER_SEEN_VALUE });

// /signup is a pure passthrough of the query string to /dashboard/plan.
const signupPassthrough = (href: string) => href.split("?")[1] ?? "";

describe("door-hanger funnel is not a closed loop", () => {
  it("1. /dashboard/plan?src=doorhanger_en with no offer param redirects to /neighbor", () => {
    expect(shouldRedirectToFoundingOffer("/dashboard/plan", "?src=doorhanger_en&zip=33156")).toBe(true);
  });

  it("2. offer=seen does NOT redirect (plan builder renders)", () => {
    expect(
      shouldRedirectToFoundingOffer("/dashboard/plan", "?src=doorhanger_en&zip=33156&offer=seen")
    ).toBe(false);
  });

  it("2b. session marker alone also releases the redirect", () => {
    expect(shouldRedirectToFoundingOffer("/dashboard/plan", "?src=doorhanger_en", true)).toBe(false);
  });

  it("3. following the /neighbor CTA href lands on the plan builder, not back on /neighbor", () => {
    const href = neighborCtaHref("?zip=33156&lang=en&src=doorhanger_en");
    expect(href.startsWith("/signup?")).toBe(true);
    const search = "?" + signupPassthrough(href);
    expect(shouldRedirectToFoundingOffer("/dashboard/plan", search)).toBe(false);
  });

  it("4. src, zip, lang and utm_* survive the whole chain", () => {
    const incoming =
      "?zip=33156&lang=en&src=doorhanger_en&placement=hero&utm_source=doorhanger&utm_medium=print&utm_campaign=founding25&gclid=abc123";
    const params = new URLSearchParams(signupPassthrough(neighborCtaHref(incoming)));
    expect(params.get("zip")).toBe("33156");
    expect(params.get("lang")).toBe("en");
    expect(params.get("src")).toBe("doorhanger_en");
    expect(params.get("placement")).toBe("hero");
    expect(params.get("utm_source")).toBe("doorhanger");
    expect(params.get("utm_medium")).toBe("print");
    expect(params.get("utm_campaign")).toBe("founding25");
    expect(params.get("gclid")).toBe("abc123");
    expect(params.get("offer")).toBe("seen");
  });

  it("non-doorhanger traffic is never redirected", () => {
    expect(shouldRedirectToFoundingOffer("/dashboard/plan", "?src=google_ads")).toBe(false);
    expect(shouldRedirectToFoundingOffer("/dashboard/plan", "")).toBe(false);
    expect(shouldRedirectToFoundingOffer("/neighbor", "?src=doorhanger_en")).toBe(false);
  });
});
