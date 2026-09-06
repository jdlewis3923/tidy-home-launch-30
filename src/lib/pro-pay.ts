/**
 * Tidy Pro pay — the ONLY place per-visit pay figures live.
 *
 * Flat amount per completed visit, set by the route's frequency. Never a
 * percentage, never the customer's price. Figures come from Justin's canon
 * rate card (Sep 2026) and are mirrored in the database function
 * public.pro_visit_pay_cents so the UI and the ledger cannot drift.
 *
 *   Service          Monthly  Biweekly  Weekly
 *   House cleaning     $64       $55      $46
 *   Lawn care          $34       $26      $25
 *   Car detailing      $64       $50       —
 *
 * Tier 2 Pro Partners earn +10% on every visit.
 */
export type ProServiceType = "cleaning" | "lawn" | "detailing";
export type RouteFrequency = "monthly" | "biweekly" | "weekly";

export const PRO_VISIT_PAY_CENTS: Record<ProServiceType, Record<RouteFrequency, number | null>> = {
  cleaning: { monthly: 6400, biweekly: 5500, weekly: 4600 },
  lawn: { monthly: 3400, biweekly: 2600, weekly: 2500 },
  detailing: { monthly: 6400, biweekly: 5000, weekly: null },
};

export const TIER_2_UPLIFT = 1.1;

/** Service area — the only ZIPs any Pro screen may ever show. */
export const PRO_SERVICE_ZIPS = ["33156", "33183", "33186"] as const;

export function visitPayCents(
  service: ProServiceType,
  frequency: RouteFrequency,
  tier?: string | null,
): number | null {
  const base = PRO_VISIT_PAY_CENTS[service]?.[frequency] ?? null;
  if (base === null) return null;
  return tier === "tier_2_pro_partner" ? Math.round(base * TIER_2_UPLIFT) : base;
}

export const money = (cents?: number | null) =>
  cents == null ? "—" : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export const SERVICE_LABEL: Record<string, string> = {
  cleaning: "House cleaning",
  lawn: "Lawn care",
  detailing: "Car care",
};

/** Tier 2 unlocks on all three, together. */
export const TIER_2_GATES = { visits: 50, rating: 4.8, days: 60 } as const;
