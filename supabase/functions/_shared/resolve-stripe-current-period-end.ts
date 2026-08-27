// Tidy — Stripe Subscription → current_period_end resolver.
//
// Stripe API versions differ on where current_period_end lives:
//   * 2024-12-18.acacia  → subscription.current_period_end
//   * 2025-03-31.basil   → subscription.items.data[*].current_period_end
//
// This helper keeps callers version-tolerant without pinning the endpoint's
// API version.

export function resolveStripeCurrentPeriodEnd(subscription: unknown): number | null {
  if (!subscription || typeof subscription !== "object") return null;
  const sub = subscription as Record<string, unknown>;

  const root = sub.current_period_end;
  if (typeof root === "number" && Number.isFinite(root)) {
    return root;
  }

  const items = sub.items;
  if (items && typeof items === "object") {
    const data = (items as Record<string, unknown>).data;
    if (Array.isArray(data)) {
      let maxEnd: number | null = null;
      for (const item of data) {
        if (item && typeof item === "object") {
          const end = (item as Record<string, unknown>).current_period_end;
          if (typeof end === "number" && Number.isFinite(end)) {
            if (maxEnd === null || end > maxEnd) maxEnd = end;
          }
        }
      }
      return maxEnd;
    }
  }

  return null;
}
