import { describe, expect, it } from "vitest";
import { ALL_QR_CODES, parseQrCode, qrRedirectTarget } from "@/lib/qr-codes";

describe("printed QR codes", () => {
  it("has exactly the 12 printed codes", () => {
    expect(ALL_QR_CODES).toHaveLength(12);
    expect(ALL_QR_CODES).toContain("en-33156-hero");
    expect(ALL_QR_CODES).toContain("es-33186-card");
  });

  it("resolves every printed code to a full attribution URL", () => {
    for (const code of ALL_QR_CODES) {
      const [lang, zip, placement] = code.split("-");
      const url = qrRedirectTarget(code);
      const p = new URLSearchParams(url.split("?")[1]);
      expect(url.startsWith("/neighbor?")).toBe(true);
      expect(p.get("lang")).toBe(lang);
      expect(p.get("zip")).toBe(zip);
      expect(p.get("placement")).toBe(placement);
      expect(p.get("src")).toBe("doorhanger");
      expect(p.get("utm_source")).toBe("doorhanger");
      expect(p.get("utm_medium")).toBe("print");
      expect(p.get("utm_campaign")).toBe(`founding_${zip}`);
      expect(p.get("utm_content")).toBe(`${lang}_${placement}`);
    }
  });

  it("never errors on garbage — degrades to placement=unknown", () => {
    for (const bad of ["asdf", "", "en-33156", "fr-33156-hero", "en-99999-hero", "en-33156-side", "a-b-c-d", "en-33156-hero-r1-x"]) {
      const url = qrRedirectTarget(bad);
      const p = new URLSearchParams(url.split("?")[1]);
      expect(parseQrCode(bad)).toBeNull();
      expect(url.startsWith("/neighbor?")).toBe(true);
      expect(p.get("src")).toBe("doorhanger");
      expect(p.get("placement")).toBe("unknown");
    }
  });

  it("accepts the ten expansion ZIPs and an optional route id", () => {
    expect(parseQrCode("es-33196-hero-r14")).toEqual({
      lang: "es",
      zip: "33196",
      placement: "hero",
      route: "r14",
    });
    const p = new URLSearchParams(qrRedirectTarget("es-33196-hero-r14").split("?")[1]);
    expect(p.get("zip")).toBe("33196");
    expect(p.get("lang")).toBe("es");
    expect(p.get("route")).toBe("r14");
  });

  it("is case-insensitive so a mis-cased scan still parses", () => {
    expect(parseQrCode("EN-33183-CARD")).toEqual({ lang: "en", zip: "33183", placement: "card", route: null });
  });
});
