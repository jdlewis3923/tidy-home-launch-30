// Admin-only. Writes contractor_pay and budget_hours metadata onto the EXISTING
// lawn prices, found by lookup_key only. Never creates a price or changes an
// amount. POST { apply: false } (default) is a read-only dry run.
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { requireServiceOrAdmin } from "../_shared/admin-auth.ts";
import { stripeSecretKey } from "../_shared/stripe-mode.ts";
import { CONTRACTOR_VISIT_PAY, SERVICE_LOOKUP_KEYS, type CanonCadence, type CanonSize } from "../_shared/pricing-canon.ts";

const BUDGET_HOURS: Record<CanonSize, string> = { 1: "0.6", 2: "0.9", 3: "1.5" };

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  const key = stripeSecretKey();
  if (!key) return jsonResponse({ ok: false, error: "stripe_not_configured" }, 500);
  const body = await req.json().catch(() => ({}));
  const apply = body?.apply === true;
  const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });

  // Pro pay never moves with cadence: lawn 18/26/40, cleaning 56/76/112 on every cadence.
  const wanted: Record<string, { contractor_pay: string; budget_hours?: string; size: CanonSize; cadence: CanonCadence }> = {};
  for (const service of ["lawn", "cleaning"] as const) {
    for (const size of [1, 2, 3] as CanonSize[]) {
      for (const cadence of ["monthly", "biweekly", "weekly"] as CanonCadence[]) {
        wanted[SERVICE_LOOKUP_KEYS[service][size][cadence]] = {
          contractor_pay: String(CONTRACTOR_VISIT_PAY[service][size].monthly),
          ...(service === "lawn" ? { budget_hours: BUDGET_HOURS[size] } : {}),
          size, cadence,
        };
      }
    }
  }
  const list = await stripe.prices.list({ lookup_keys: Object.keys(wanted), limit: 100 });
  const out = [];
  for (const p of list.data) {
    const w = wanted[p.lookup_key ?? ""];
    if (!w) continue;
    const before = { contractor_pay: p.metadata?.contractor_pay ?? null, budget_hours: p.metadata?.budget_hours ?? null };
    let after = before;
    const needs = before.contractor_pay !== w.contractor_pay || (w.budget_hours != null && before.budget_hours !== w.budget_hours);
    if (apply && needs) {
      const u = await stripe.prices.update(p.id, { metadata: { contractor_pay: w.contractor_pay, ...(w.budget_hours ? { budget_hours: w.budget_hours } : {}) } });
      after = { contractor_pay: u.metadata?.contractor_pay ?? null, budget_hours: u.metadata?.budget_hours ?? null };
    }
    out.push({ lookup_key: p.lookup_key, active: p.active, unit_amount: p.unit_amount, expected: w, before, after });
  }
  const missing = Object.keys(wanted).filter((k) => !list.data.some((p) => p.lookup_key === k));
  return jsonResponse({ ok: true, apply, prices: out, missing });
});
