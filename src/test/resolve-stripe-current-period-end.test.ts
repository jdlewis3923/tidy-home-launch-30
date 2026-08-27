import { describe, expect, it } from "vitest";
import { resolveStripeCurrentPeriodEnd } from "../../supabase/functions/_shared/resolve-stripe-current-period-end";

describe("resolveStripeCurrentPeriodEnd", () => {
  const end = 1756348800;

  it("returns subscription.current_period_end for acacia-shaped subscriptions", () => {
    const subscription = {
      id: "sub_acacia",
      current_period_end: end,
      items: { data: [{ id: "si_1", current_period_end: end - 1000 }] },
    };
    expect(resolveStripeCurrentPeriodEnd(subscription)).toBe(end);
  });

  it("falls back to the max current_period_end across items for basil/clover-shaped subscriptions", () => {
    const subscription = {
      id: "sub_basil",
      items: {
        data: [
          { id: "si_1", current_period_end: end - 5000 },
          { id: "si_2", current_period_end: end },
          { id: "si_3", current_period_end: end - 1000 },
        ],
      },
    };
    expect(resolveStripeCurrentPeriodEnd(subscription)).toBe(end);
  });

  it("returns null when neither shape is present", () => {
    const subscription = { id: "sub_orphan", items: { data: [] } };
    expect(resolveStripeCurrentPeriodEnd(subscription)).toBeNull();
  });
});
