/**
 * Tidy Pro pay — the pro-facing view of the pay canon.
 *
 * Pay is a flat amount per completed visit, set by the plan's SIZE and CADENCE.
 * The figures live in `src/lib/pricing-canon.ts` (mirrored in the database
 * function public.contractor_visit_pay_cents) so the portal and the ledger
 * cannot drift. A percentage is never shown to a pro, and the customer's price
 * is never exposed on any Pro screen or API response.
 *
 * Tier 2 Pro Partners earn +10% on every visit, rounded to the dollar.
 */
import {
  CONTRACTOR_SHINE_PAY,
  CONTRACTOR_SURCHARGE_PAY,
  CONTRACTOR_VISIT_PAY,
  TIER_2_UPLIFT,
  contractorVisitPay,
  type CanonCadence,
  type CanonSize,
} from "@/lib/pricing-canon";

export type ProServiceType = "cleaning" | "lawn" | "detailing";
export type RouteFrequency = CanonCadence;

export { CONTRACTOR_VISIT_PAY, CONTRACTOR_SHINE_PAY, CONTRACTOR_SURCHARGE_PAY, TIER_2_UPLIFT };

/** Service area — the only ZIPs any Pro screen may ever show. */
export const PRO_SERVICE_ZIPS = ["33156", "33183", "33186"] as const;

/**
 * Pay in cents for one completed visit.
 * `size` is the plan size (1/2/3); `surcharge` adds the pro's share of a
 * larger-home or larger-yard surcharge. For Shine Complete, pass the visit kind.
 */
export function visitPayCents(
  service: ProServiceType,
  frequency: RouteFrequency,
  tier?: string | null,
  opts?: { size?: CanonSize | null; surcharge?: boolean; shineVisit?: "maintenance_wash" | "full_detail" },
): number | null {
  const size = (opts?.size ?? 1) as CanonSize;
  if (!size) return null;
  const dollars = contractorVisitPay({
    service,
    size,
    cadence: frequency,
    tier: tier === "tier_2_pro_partner" ? 2 : 1,
    surcharge: opts?.surcharge ?? false,
    shineVisit: opts?.shineVisit,
  });
  return Math.round(dollars * 100);
}

export const money = (cents?: number | null) =>
  cents == null ? "—" : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export const SERVICE_LABEL: Record<string, string> = {
  cleaning: "House cleaning",
  lawn: "Lawn care",
  detailing: "Shine Complete",
};

/** Tier 2 unlocks on all three, together. */
export const TIER_2_GATES = { visits: 50, rating: 4.8, days: 60 } as const;
