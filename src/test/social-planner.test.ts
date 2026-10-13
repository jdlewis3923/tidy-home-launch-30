import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import posts from "./fixtures/social-calendar-posts.json";
import { planCalendar, renderTemplate, instagramVersion, isSocialBlackout, type PlanRow, type PlanAnchors } from "@/lib/socialPlanner";

type Fx = { n: string; post_number: number; channel: "meta_combined" | "nextdoor"; anchor_type: PlanRow["anchor_type"]; anchor_value: string | null; priority: number; not_before: PlanRow["not_before"]; drop_if_bumped: boolean; is_spare: boolean; A: string | null; B: string | null; template_copy: string };
const fx = posts as Fx[];
const rows = (): PlanRow[] => fx.map((p) => ({ id: p.n, post_number: p.post_number, channel: p.channel, anchor_type: p.anchor_type, anchor_value: p.anchor_value, priority: p.priority, not_before: p.not_before, drop_if_bumped: p.drop_if_bumped, is_spare: p.is_spare, status: "scheduled", scheduled_for: null }));
const base: PlanAnchors = { launch: "2026-11-23", carLaunch: null, conversion: "2026-11-16", hangerDrop1: "2026-11-02" };

function check(a: PlanAnchors, col: "A" | "B", waiting: string[]) {
  const res = new Map(planCalendar(rows(), a).map((r) => [r.id, r]));
  for (const p of fx.filter((x) => !x.is_spare)) expect([p.n, res.get(p.n)!.date]).toEqual([p.n, p[col]]);
  expect(fx.filter((p) => !p.is_spare && !res.get(p.n)!.date).map((p) => p.n).sort()).toEqual(waiting.sort());
  const spares = fx.filter((p) => p.is_spare && res.get(p.n)!.date);
  expect(spares.length).toBe(3);
  for (const s of spares) expect(res.get(s.n)!.date! < a.launch!).toBe(true);
  const used = [...res.values()].filter((r) => r.date);
  for (const r of used) expect(isSocialBlackout(r.date!)).toBe(false);
  const keys = used.map((r) => `${fx.find((p) => p.n === r.id)!.channel}|${r.date}`);
  expect(new Set(keys).size).toBe(keys.length);
}

describe("social planner", () => {
  it("39 posts + 4 spares loaded", () => { expect(fx.filter((p) => !p.is_spare).length).toBe(39); expect(fx.filter((p) => p.is_spare).length).toBe(4); });
  it("S-2 launch 23 Nov, no car date", () => check(base, "A", ["24", "21", "36", "25", "26", "32"]));
  it("S-3 launch 23 Nov, car 7 Dec", () => check({ ...base, carLaunch: "2026-12-07" }, "B", ["21", "34", "35"]));
  it("S-6 posted rows never move", () => {
    const r = rows(); const p1 = r.find((x) => x.id === "17")!; p1.status = "posted"; p1.scheduled_for = "2026-11-23T16:00:00Z";
    const res = planCalendar(r, { ...base, launch: "2026-11-30", conversion: "2026-11-23" });
    expect(res.find((x) => x.id === "17")).toBeUndefined();
  });
  it("S-5 tokens render on the day of posting", () => {
    const t = fx.find((p) => p.n === "17")!.template_copy;
    expect(renderTemplate(t, base, "2026-11-23")).toContain("Car care opens as soon as enough neighbors reserve it.");
    expect(renderTemplate(t, { ...base, carLaunch: "2026-12-07" }, "2026-11-23")).toContain("Car care starts Monday 7 December.");
    expect(renderTemplate(t, { ...base, carLaunch: "2026-12-07" }, "2026-12-07")).toContain("Car care is live.");
    expect(renderTemplate(fx.find((p) => p.n === "12")!.template_copy, base, "2026-11-05")).toContain("week of 16 November");
    expect(renderTemplate(fx.find((p) => p.n === "10")!.template_copy, base, "2026-11-02")).toContain("First visits start Monday 23 November.");
  });
  it("Instagram swaps link lines", () => {
    expect(instagramVersion("a\nReserve at jointidy.co/founding\nb")).toBe("a\nLink in bio.\nb");
  });
  it("mirror is identical", () => {
    expect(readFileSync("supabase/functions/_shared/socialPlanner.ts", "utf8")).toBe(readFileSync("src/lib/socialPlanner.ts", "utf8"));
  });
});
