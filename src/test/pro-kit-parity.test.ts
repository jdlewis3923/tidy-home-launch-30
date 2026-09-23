import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { KIT_BY_SERVICE, kitContentsLine, kitIncludesVest, kitOrderSummary } from "@/lib/proKit";

const MARKER = "// ---- SHARED KIT STANDARD ----\n";

describe("pro kit standard", () => {
  it("keeps the edge-function copy byte-identical to src/lib/proKit.ts", () => {
    const src = readFileSync("src/lib/proKit.ts", "utf8");
    const deno = readFileSync("supabase/functions/_shared/pro-kit.ts", "utf8");
    expect(deno.slice(deno.indexOf(MARKER) + MARKER.length)).toBe(src);
  });

  it("gives house cleaning two polos and a badge, and no vest", () => {
    expect(kitContentsLine("House Cleaning")).toBe("2 embroidered polos + photo ID badge");
    expect(kitIncludesVest("House Cleaning")).toBe(false);
    expect(JSON.stringify(KIT_BY_SERVICE.cleaning)).not.toMatch(/vest/i);
  });

  it("gives lawn two tees, two hi-vis vests and a badge", () => {
    expect(kitContentsLine("Lawn Care")).toBe("2 tees + 2 hi-vis vests + photo ID badge");
    expect(kitIncludesVest("Lawn Care")).toBe(true);
  });

  it("gives car care two tees and a badge, no vest", () => {
    expect(kitContentsLine("Car Care")).toBe("2 tees + photo ID badge");
    expect(kitIncludesVest("Car Care")).toBe(false);
  });

  it("offers magnets on cleaning too, and holds the order when the door will not hold", () => {
    const yes = kitOrderSummary({
      service_line: "House Cleaning",
      shirt_size: "L",
      magnets_opt_in: true,
      magnet_test: "No",
      vehicle_year: "2019",
      vehicle_make: "Honda",
      vehicle_model: "CR-V",
      vehicle_ad_signed_at: "2026-09-23T00:00:00Z",
    });
    expect(yes).toMatch(/Vehicle magnets: YES/);
    expect(yes).toMatch(/HOLD MAGNETS/);
    expect(yes).toMatch(/\$15\/month vehicle advertising credit/);

    const no = kitOrderSummary({ service_line: "House Cleaning", shirt_size: "L", magnets_opt_in: false });
    expect(no).toMatch(/Vehicle magnets: no \(opted out/);
    expect(no).not.toMatch(/HOLD MAGNETS/);
  });

  it("never calls a Pro an employee or mandates appearance", () => {
    const text = readFileSync("src/lib/proKit.ts", "utf8") + readFileSync("src/lib/vehicleAdAgreement.ts", "utf8");
    expect(text).not.toMatch(/employee/i);
    expect(text).not.toMatch(/must wear/i);
  });
});
