// Tidy — Florida sales tax rule for checkout.
//
// AUDIT NOTE — single source of truth for the taxability decision.
//
// Rules encoded here:
//  * Residential house cleaning is NOT taxable in Florida
//    (Fla. Admin. Code r. 12A-1.0091 — nonresidential cleaning only).
//  * Residential lawn care / landscaping is NOT taxable.
//  * Motor vehicle detailing is a nontaxable service UNLESS a tangible
//    product such as wax, sealant or ceramic coating is applied to the
//    vehicle. When such a product IS applied, the ENTIRE charge for the
//    transaction becomes taxable (Fla. Admin. Code r. 12A-1.006(6);
//    Fla. Stat. 212.05).
//  * Rate: 6.0% Florida state sales tax + 1.0% Miami-Dade County
//    discretionary surtax = 7.0% total.
//
// Because the trigger is "was a coating product applied", the decision is a
// property of the CART, not of a price object. Setting tax_behavior on the
// detailing prices would tax every detailing subscription — including ones
// with no coating — which is over-collection. Hence this cart-level check.

/** Total combined rate applied when the transaction is taxable. */
export const FLORIDA_TAX = {
  /** 6% FL state + 1% Miami-Dade surtax. */
  percentage: 7.0,
  jurisdiction: "US - FL - Miami-Dade",
  displayName: "FL sales tax + Miami-Dade surtax",
  /**
   * Catalog addon_name values that mean wax / sealant / ceramic coating was
   * applied to the vehicle, which makes the whole transaction taxable.
   */
  coatingAddonIds: ["clayBarCeramic"] as const,
} as const;

/**
 * Master switch mirroring app_settings.fl_sales_tax_enabled. Tidy is NOT
 * registered to collect Florida sales tax, so nothing is charged and nothing
 * may be displayed. Flip BOTH this constant and the app_settings row together.
 */
export const FL_SALES_TAX_COLLECTION_ENABLED = false;

const COATING_SET = new Set<string>(FLORIDA_TAX.coatingAddonIds as readonly string[]);

/** True when the cart contains a wax/sealant/coating add-on. */
export function cartTriggersFloridaTax(addons: Array<{ addon_name: string }>): boolean {
  return addons.some((a) => COATING_SET.has(a.addon_name));
}

// deno-lint-ignore no-explicit-any
type StripeLike = any;

let cachedTaxRateId: string | null = null;

/**
 * Resolves (creating once, then reusing) the 7% exclusive Stripe TaxRate used
 * for coating-triggered taxable transactions. Stripe TaxRate objects work
 * without any Stripe Tax / jurisdiction registration.
 */
export async function getFloridaTaxRateId(stripe: StripeLike): Promise<string> {
  if (cachedTaxRateId) return cachedTaxRateId;

  const existing = await stripe.taxRates.list({ active: true, limit: 100 });
  const match = existing.data?.find(
    // deno-lint-ignore no-explicit-any
    (r: any) =>
      r.metadata?.source === "tidy_fl_coating" &&
      Number(r.percentage) === FLORIDA_TAX.percentage &&
      r.inclusive === false,
  );
  if (match) {
    cachedTaxRateId = match.id;
    return match.id;
  }

  const created = await stripe.taxRates.create({
    display_name: FLORIDA_TAX.displayName,
    description: FLORIDA_TAX.jurisdiction,
    percentage: FLORIDA_TAX.percentage,
    inclusive: false,
    country: "US",
    state: "FL",
    metadata: { source: "tidy_fl_coating", rule: "12A-1.006(6)" },
  });
  cachedTaxRateId = created.id;
  return created.id;
}
