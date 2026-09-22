import { describe, expect, it } from "vitest";
import { scoreApplicant } from "@/lib/hiring/score";
import { driveMinutes } from "@/lib/hiring/geo";
import { text1, text2, inCallWindow } from "@/lib/hiring/texts";

const base = {
  service: "cleaning" as const,
  city_or_zip: "33156",
  bilingual: "yes",
  drivers_license: "yes",
  work_authorized: "yes",
  own_equipment: "yes",
  background_check_ok: "yes",
  reads_texts: "yes",
};

describe("drive minutes", () => {
  it("resolves the anchor ZIP to zero", () => {
    expect(driveMinutes("33156")).toBe(0);
  });
  it("resolves city names, longest match first", () => {
    expect(driveMinutes("North Miami Beach")).toBeGreaterThan(driveMinutes("Pinecrest")!);
  });
  it("returns null for an unknown location", () => {
    expect(driveMinutes("Boise, ID")).toBeNull();
  });
});

describe("hard gates", () => {
  it("disqualifies on a single no and names the gate", () => {
    const r = scoreApplicant({ ...base, drivers_license: "no" });
    expect(r.queue_state).toBe("disqualified");
    expect(r.flags.some((f) => f.includes("driver's license"))).toBe(true);
  });

  it("does not disqualify on unknown, but flags a call confirmation", () => {
    const r = scoreApplicant({ ...base, own_equipment: "unknown" });
    expect(r.queue_state).not.toBe("disqualified");
    expect(r.flags.some((f) => f.startsWith("confirm on call:"))).toBe(true);
  });
});

describe("scoring", () => {
  it("scores a strong local A-tier applicant", () => {
    const r = scoreApplicant({
      ...base,
      service: "lawn",
      years_in_service: 6,
      owner_operator: true,
      has_insurance: true,
      trade_job_current: true,
    });
    // 20 drive + 24 years + 15 owner + 10 ins + 10 trade
    expect(r.score).toBe(79);
    expect(r.tier).toBe("A");
  });

  it("caps years at 30 points", () => {
    const r = scoreApplicant({ ...base, years_in_service: 40 });
    expect(r.score).toBe(50);
  });

  it("halves commercial-only cleaning experience", () => {
    const r = scoreApplicant({
      ...base,
      years_in_service: 5,
      notes: "5 years hotel housekeeping",
    });
    expect(r.score).toBe(30); // 20 drive + 10
  });

  it("penalises an unsupported experience claim", () => {
    const r = scoreApplicant({ ...base, years_in_service: 2, experience_matches_resume: "no" });
    expect(r.flags).toContain("ask where the experience came from");
    expect(r.score).toBe(13); // 20 + 8 - 15
  });

  it("holds anyone over 30 minutes out", () => {
    const r = scoreApplicant({ ...base, city_or_zip: "Fort Lauderdale", years_in_service: 3 });
    expect(r.queue_state).toBe("hold");
    expect(r.flags).toContain("over 30 min");
  });

  it("falls back to tier_hint when there are no signals at all", () => {
    expect(scoreApplicant({ service: "lawn", tier_hint: "A" }).score).toBe(62);
    expect(scoreApplicant({ service: "lawn", tier_hint: "B" }).tier).toBe("B");
    expect(scoreApplicant({ service: "lawn", tier_hint: "C" }).tier).toBe("C");
  });

  it("awards the fresh-application bonus inside 72 hours only", () => {
    const now = new Date("2026-09-22T12:00:00Z");
    const fresh = scoreApplicant(
      { ...base, years_in_service: 1, applied_on: "2026-09-21" },
      now,
    );
    const stale = scoreApplicant(
      { ...base, years_in_service: 1, applied_on: "2026-08-01" },
      now,
    );
    expect(fresh.score - stale.score).toBe(8);
  });
});

describe("texts", () => {
  it("builds bilingual text 1 with the first name and service", () => {
    const msg = text1("Maria Lopez", "lawn");
    expect(msg).toContain("Hi Maria");
    expect(msg).toContain("lawn care");
    expect(msg).toContain("cuidado de césped");
  });

  it("builds the follow-up", () => {
    expect(text2("Jose")).toContain("Hola Jose");
  });

  it("accepts a weekday 7:30 PM call and rejects Sunday", () => {
    expect(inCallWindow(new Date("2026-09-22T23:30:00Z"))).toBe(true); // Tue 7:30 PM ET
    expect(inCallWindow(new Date("2026-09-20T23:30:00Z"))).toBe(false); // Sunday
  });
});
