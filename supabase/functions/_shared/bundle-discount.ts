// Tidy — bundle discount resolver (server side).
//
// public.bundle_discount_tiers is the SINGLE SOURCE OF TRUTH for the rate that
// is actually charged. The client reads the same table for the displayed total
// (src/lib/bundle-discount.ts) and src/test/checkout-stripe-parity.test.ts
// asserts against the live DB value, so the two cannot diverge.
//
// app_settings.bundle_discount_pct is a legacy mirror kept only as a fallback.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

const HARD_FALLBACK: Record<number, number> = { 2: 10, 3: 15 };

function fromTierMap(map: Record<number, number>, uniqueServices: number): number {
  let pct = 0;
  for (const [countKey, value] of Object.entries(map)) {
    const count = Number(countKey);
    if (uniqueServices >= count && Number(value) > pct) pct = Number(value);
  }
  return pct;
}

async function fromAppSettings(
  supabase: SupabaseLike,
  uniqueServices: number,
  tag: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "bundle_discount_pct")
    .maybeSingle();
  if (error || !data?.value) {
    if (error) console.warn(`[${tag}] app_settings bundle discount read failed`, error.message);
    return fromTierMap(HARD_FALLBACK, uniqueServices);
  }
  const value = data.value;
  const map =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<number, number>)
      : HARD_FALLBACK;
  const pct = fromTierMap(map, uniqueServices);
  return pct > 0 ? pct : fromTierMap(HARD_FALLBACK, uniqueServices);
}

/** Bundle discount percentage (0–100) for a count of distinct services. */
export async function resolveBundleDiscountPct(
  supabase: SupabaseLike,
  uniqueServices: number,
  tag = "checkout",
): Promise<number> {
  if (uniqueServices < 2) return 0;

  const { data, error } = await supabase
    .from("bundle_discount_tiers")
    .select("service_count, discount_pct");

  if (error || !data?.length) {
    if (error) console.warn(`[${tag}] bundle_discount_tiers read failed`, error.message);
    return await fromAppSettings(supabase, uniqueServices, tag);
  }

  const map: Record<number, number> = {};
  for (const row of data) map[Number(row.service_count)] = Number(row.discount_pct);
  const pct = fromTierMap(map, uniqueServices);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return await fromAppSettings(supabase, uniqueServices, tag);
  }
  return pct;
}
