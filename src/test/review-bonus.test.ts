import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { REVIEW_BONUS_LINE } from "@/lib/reviewBonus";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !p.includes("/test/") && !p.endsWith("types.ts")) out.push(p);
  }
  return out;
}

describe("review bonus", () => {
  it("wording is mirrored byte-for-byte to edge functions", () => {
    expect(read("src/lib/reviewBonus.ts")).toBe(read("supabase/functions/_shared/review-bonus.ts"));
  });

  it("uses the canonical sentence", () => {
    expect(REVIEW_BONUS_LINE).toBe(
      "Review bonus — $25. Every five-star Google review from a member you've served that names you pays $25, added to that Friday's deposit. One per member.",
    );
  });

  it("appears on every Pro-facing surface", () => {
    for (const f of [
      "supabase/functions/_shared/pro-emails.ts",
      "supabase/functions/_shared/pro-onboarding.ts",
      "supabase/functions/contract-sign/index.ts",
      "src/pages/ContractSign.tsx",
      "src/components/pro/ProPartnerStrip.tsx",
    ]) expect(read(f)).toMatch(/REVIEW_BONUS_LINE/);
  });

  it("retired bonuses never reappear in app copy", () => {
    const files = [...walk(join(process.cwd(), "src")), ...walk(join(process.cwd(), "supabase/functions"))];
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/\$200 referral bonus|\$100 attendance bonus|attendance bonus|\$50 review bonus/i);
    }
  });
});
