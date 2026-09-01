import { describe, it, expect } from "vitest";
import { doorhangerGateAllows, isDoorhangerVisitor } from "@/lib/doorhanger";
import { buildSignupHref, FORWARDED_PARAMS } from "@/lib/landing";

describe("coming-soon gate: door-hanger carve-out", () => {
  it("1. anonymous with no door-hanger signal is still gated on /signup", () => {
    expect(doorhangerGateAllows("/signup", "", null)).toBe(false);
    expect(doorhangerGateAllows("/dashboard/plan", "?zip=33156", null)).toBe(false);
    expect(doorhangerGateAllows("/checkout/success", "", null)).toBe(false);
  });

  it("2. src=doorhanger_en on the URL opens /signup and the plan builder", () => {
    expect(doorhangerGateAllows("/signup", "?src=doorhanger_en&zip=33156", null)).toBe(true);
    expect(doorhangerGateAllows("/dashboard/plan", "?src=doorhanger_en", null)).toBe(true);
  });

  it("3. stored tidy_landing_source alone (no src param) opens the plan builder", () => {
    expect(doorhangerGateAllows("/dashboard/plan", "", "doorhanger_es")).toBe(true);
    expect(doorhangerGateAllows("/signup", "", "doorhanger")).toBe(true);
  });

  it("4. the carve-out reaches checkout", () => {
    expect(doorhangerGateAllows("/checkout/success", "", "doorhanger_en")).toBe(true);
    expect(doorhangerGateAllows("/dashboard/confirmation", "", "doorhanger_en")).toBe(true);
  });

  it("does NOT open unrelated routes", () => {
    for (const path of ["/", "/billing", "/account", "/house-cleaning", "/refer"]) {
      expect(doorhangerGateAllows(path, "?src=doorhanger_en", "doorhanger_en")).toBe(false);
    }
  });

  it("ignores non-doorhanger sources", () => {
    expect(isDoorhangerVisitor("?src=google_ads", "yard_sign")).toBe(false);
    expect(isDoorhangerVisitor("?src=doorhanger_es", null)).toBe(true);
  });

  it("6. src, zip, lang, placement and utm_* survive the signup hop", () => {
    const q =
      "?src=doorhanger_en&zip=33156&lang=en&placement=hero&route=r12&utm_source=hanger&utm_medium=print&utm_campaign=launch&utm_content=a";
    const href = buildSignupHref(q, {});
    for (const key of ["src", "zip", "lang", "placement", "utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
      expect(FORWARDED_PARAMS).toContain(key);
      expect(href).toContain(`${key}=`);
    }
  });
});
