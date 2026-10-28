import { describe, it, expect } from "vitest";
import { signingPhone, signingCode } from "@/lib/signing-day";
import { kitItemsFor } from "@/lib/proKit";
describe("Signing day rules", () => {
  it("normalizes US phone numbers for password-free login", () => {
    expect(signingPhone.parse("(305) 555-0188")).toBe("+13055550188");
    expect(signingPhone.safeParse("123").success).toBe(false);
  });
  it("rejects nonnumeric one-time codes", () => {
    expect(signingCode.safeParse("123456").success).toBe(true);
    expect(signingCode.safeParse("abc123").success).toBe(false);
  });
  it("provides two cleaning polos", () => expect(kitItemsFor("cleaning")[0].qty).toBe(2));
  it("provides two lawn tees and two vests", () => expect(kitItemsFor("lawn").slice(0,2).map(i => i.qty)).toEqual([2,2]));
  it("provides two car tees", () => expect(kitItemsFor("car")[0].qty).toBe(2));
});