import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LAUNCH_DATE_LONG, LAUNCH_DATE_SHORT, FOUNDING_CAP } from "@/lib/launch";

describe("launch canon", () => {
  it("keeps the edge-function copy byte-identical", () => {
    expect(readFileSync("supabase/functions/_shared/launch.ts", "utf8")).toBe(readFileSync("src/lib/launch.ts", "utf8"));
  });
  it("renders the published start date", () => {
    expect(LAUNCH_DATE_LONG).toBe("Monday, November 16");
    expect(LAUNCH_DATE_SHORT).toBe("Monday, Nov 16");
    expect(FOUNDING_CAP).toBe(25);
  });
});
