// Tidy — Stripe Invoice → subscription id resolver.
//
// Stripe API versions differ on where the subscription id lives on an invoice:
//   * 2024-12-18.acacia  → invoice.subscription (string or expanded object)
//   * 2025-10-29.clover  → invoice.parent.subscription_details.subscription
//
// This helper lets the webhook stay version-tolerant without touching the
// endpoint's API version or event subscriptions.

export function resolveStripeSubscriptionId(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== "object") return null;
  const inv = invoice as Record<string, unknown>;

  const sub = inv.subscription;
  if (typeof sub === "string") return sub;
  if (sub && typeof sub === "object") {
    const id = (sub as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }

  const parent = inv.parent;
  if (parent && typeof parent === "object") {
    const details = (parent as Record<string, unknown>).subscription_details;
    if (details && typeof details === "object") {
      const parentSub = (details as Record<string, unknown>).subscription;
      if (typeof parentSub === "string") return parentSub;
      if (parentSub && typeof parentSub === "object") {
        const parentId = (parentSub as Record<string, unknown>).id;
        if (typeof parentId === "string") return parentId;
      }
    }
  }

  return null;
}
