import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FOUNDING_CAP, startsLine, fmtLaunchDate, type LaunchConfig } from "@/lib/launch";

describe("launch canon", () => {
  it("keeps the edge-function copy byte-identical", () => {
    expect(readFileSync("supabase/functions/_shared/launch.ts", "utf8")).toBe(readFileSync("src/lib/launch.ts", "utf8"));
  });
  const row = (first: string) => ({ first_visit_date: first }) as LaunchConfig["cleaning"];
  const cfg: LaunchConfig = { cleaning: row("2026-11-16"), lawn: row("2026-11-16"), car: row("2026-11-30") };
  it("formats launch_config dates", () => {
    expect(fmtLaunchDate("2026-11-16")).toBe("Monday, November 16");
    expect(fmtLaunchDate("2026-11-16", "en", "short")).toBe("Monday, Nov 16");
    expect(FOUNDING_CAP).toBe(25);
  });
  it("never shows a car care customer the cleaning/lawn date alone", () => {
    expect(startsLine(cfg, "en", ["detailing"])).toBe("Car care begins Monday, November 30");
    expect(startsLine(cfg, "en", ["lawn"])).toBe("First visits begin Monday, November 16");
    expect(startsLine(cfg, "en")).toContain("car care begins Monday, November 30");
  });
  it("keeps launch dates out of the code", () => {
    const { execSync } = require("node:child_process");
    const hits = execSync(
      `grep -rniE "(nov(ember)?\\.? ?(2|5|9|16|17|30)\\b|\\b(2|5|9|16|17|23|26|30) (de )?nov(iembre)?|oct(ober)?\\.? ?(20|26|27)\\b|\\b(26|27) (de )?oct|2026-1[01]-[0-3][0-9])" src supabase/functions --include=*.ts --include=*.tsx -l | grep -vE "integrations/supabase/types.ts|src/test/|asset.json" || true`,
      { encoding: "utf8" },
    ).trim();
    expect(hits).toBe("");
  });
});
