import { describe, it, expect } from "vitest";
import { parseCarWashKey, pickPro } from "../../supabase/functions/_shared/jobber-rules";

const pool = [
  { connecteam_user_id: 31157941, pro_name: "Susan Horn", priority: 1 },
  { connecteam_user_id: 31157945, pro_name: "Jenifer Whitney", priority: 2 },
];
const at = (h: number) => `2026-11-10T${String(h).padStart(2, "0")}:00:00Z`;

describe("shift assignment", () => {
  it("goes to the primary Pro when she is free", () => {
    expect(pickPro(pool, [], at(14), at(17))).toBe(31157941);
  });
  it("goes to the second Pro when the primary has an overlapping shift", () => {
    expect(pickPro(pool, [{ connecteam_user_id: 31157941, start_at: at(15), end_at: at(18) }], at(14), at(17))).toBe(31157945);
  });
  it("stays with the primary when her other shift does not overlap", () => {
    expect(pickPro(pool, [{ connecteam_user_id: 31157941, start_at: at(17), end_at: at(19) }], at(14), at(17))).toBe(31157941);
  });
  it("is an open shift when every Pro is busy", () => {
    const busy = pool.map((p) => ({ connecteam_user_id: p.connecteam_user_id, start_at: at(13), end_at: at(16) }));
    expect(pickPro(pool, busy, at(14), at(17))).toBeNull();
  });
  it("returns a moved visit to Susan when the primary is free", () => {
    expect(pickPro(pool, [], at(14), at(17), 31157945)).toBe(31157941);
  });
  it("includes an overlap that started the preceding day", () => {
    expect(pickPro(pool, [{ connecteam_user_id: 31157941, start_at: '2026-11-09T22:00:00Z', end_at: at(15) }], at(14), at(17))).toBe(31157945);
  });
});

describe("car wash add-on key", () => {
  it("reads 1 wash and 2 washes with size", () => {
    expect(parseCarWashKey("wash_2_x1")).toEqual({ size: 2, washes: 1 });
    expect(parseCarWashKey("wash_2_x2")).toEqual({ size: 2, washes: 2 });
    expect(parseCarWashKey("wash_1_x2")).toEqual({ size: 1, washes: 2 });
  });
  it("refuses an unknown key instead of guessing", () => {
    expect(() => parseCarWashKey("car_wash_two")).toThrow();
  });
});
