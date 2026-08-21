// Tidy — Bundle discount coupon resolver
//
// The bundle discount (10% for 2 distinct services, 15% for 3) has to be a real
// Stripe coupon attached to the Checkout Session, not just metadata. This module
// resolves a deterministic, rate-locked coupon id and verifies it every time so a
// customer can never be charged against a coupon at the wrong rate.
//
// NOTE: the legacy coupons FHR7cYh1 (TIDY_2_SERVICE, 15% forever) and
// tGzMjBYu (TIDY_3_SERVICE, 20% forever) encode superseded rates and are
// intentionally NOT used here (and not modified or deleted).

// deno-lint-ignore no-explicit-any
type StripeLike = any;

const COUPON_IDS: Record<number, string> = {
  10: "TIDY_BUNDLE_10PCT",
  15: "TIDY_BUNDLE_15PCT",
};

// deno-lint-ignore no-explicit-any
function verifyCoupon(coupon: any, id: string, pct: number): string {
  if (coupon?.percent_off !== pct) {
    throw new Error(
      `bundle coupon ${id} has percent_off=${coupon?.percent_off} but ${pct} was required`,
    );
  }
  if (coupon?.duration !== "forever") {
    throw new Error(`bundle coupon ${id} has duration=${coupon?.duration} but 'forever' was required`);
  }
  if (coupon?.valid !== true) {
    throw new Error(`bundle coupon ${id} is not valid (valid=${coupon?.valid})`);
  }
  return id;
}

/**
 * Returns the Stripe coupon id for the given bundle discount percentage,
 * creating it if it does not exist yet. Throws on any rate mismatch.
 */
export async function getBundleCouponId(stripe: StripeLike, pct: number): Promise<string> {
  const id = COUPON_IDS[pct];
  if (!id) {
    throw new Error(`unsupported bundle discount pct: ${pct} (expected 10 or 15)`);
  }

  try {
    const existing = await stripe.coupons.retrieve(id);
    return verifyCoupon(existing, id, pct);
  } catch (err) {
    // deno-lint-ignore no-explicit-any
    const code = (err as any)?.code ?? (err as any)?.raw?.code;
    if (code !== "resource_missing") throw err;
  }

  try {
    const created = await stripe.coupons.create({
      id,
      percent_off: pct,
      duration: "forever",
      name: `Tidy bundle ${pct}% off`,
      metadata: { source: "tidy_bundle" },
    });
    return verifyCoupon(created, id, pct);
  } catch (err) {
    // Creation raced with another request — retrieve and re-verify.
    const again = await stripe.coupons.retrieve(id);
    if (!again) throw err;
    return verifyCoupon(again, id, pct);
  }
}
