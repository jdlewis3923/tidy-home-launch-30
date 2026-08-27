import { describe, expect, it } from "vitest";
import { resolveStripeSubscriptionId } from "../../supabase/functions/_shared/resolve-stripe-subscription-id";

describe("resolveStripeSubscriptionId", () => {
  const subId = "sub_1QkExampleStripeSubscriptionId";

  it("returns the id from an acacia-shaped invoice (subscription on the root)", () => {
    const invoice = {
      id: "in_acacia",
      subscription: { id: subId, object: "subscription" },
    };
    expect(resolveStripeSubscriptionId(invoice)).toBe(subId);
  });

  it("returns the id from a clover-shaped invoice (subscription under parent)", () => {
    const invoice = {
      id: "in_clover",
      parent: {
        subscription_details: {
          subscription: { id: subId, object: "subscription" },
        },
      },
    };
    expect(resolveStripeSubscriptionId(invoice)).toBe(subId);
  });

  it("returns null when neither shape is present", () => {
    const invoice = { id: "in_orphan" };
    expect(resolveStripeSubscriptionId(invoice)).toBeNull();
  });

  it("prefers the root-level string subscription id when both shapes exist", () => {
    const invoice = {
      id: "in_both",
      subscription: subId,
      parent: {
        subscription_details: {
          subscription: { id: "sub_wrong", object: "subscription" },
        },
      },
    };
    expect(resolveStripeSubscriptionId(invoice)).toBe(subId);
  });

  it("resolves a clover-shaped string subscription id", () => {
    const invoice = {
      id: "in_clover_string",
      parent: {
        subscription_details: {
          subscription: subId,
        },
      },
    };
    expect(resolveStripeSubscriptionId(invoice)).toBe(subId);
  });
});
