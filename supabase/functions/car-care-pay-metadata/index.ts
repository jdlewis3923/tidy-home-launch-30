import '../_shared/http.ts';
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { CONTRACTOR_SHINE_PAY, type CanonSize } from '../_shared/pricing-canon.ts';

// Metadata-only audit across active AND archived prices, in live and test.
// Never creates prices, changes amounts/activation, or sends notifications.
Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === 'test' ? 'test' : 'live';
  const key = Deno.env.get(mode === 'test' ? 'STRIPE_TEST_SECRET_KEY' : 'STRIPE_SECRET_KEY');
  if (!key) return jsonResponse({ ok: false, mode, error: 'missing_stripe_key' }, 503);
  const apply = body.apply === true;
  const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() });
  const changed = []; const verified = []; const unresolved = [];
  let scanned = 0;
  try {
    for await (const price of stripe.prices.list({ limit: 100, expand: ['data.product'] })) {
      scanned++;
      const product = price.product as Stripe.Product;
      const md = price.metadata ?? {};
      const combined = { ...(product.metadata ?? {}), ...md };
      const lookup = price.lookup_key ?? '';
      const keyMatch = /^(shine|wash)_([123])(?:_x([12]))?$/.exec(lookup);
      const service = combined.service_type ?? combined.service ?? '';
      const name = product.name ?? '';
      const car = !!keyMatch || /^(detailing|car_care|car_wash)$/.test(service) || /shine complete|car wash|full detail|car care/i.test(name);
      if (!car || lookup.startsWith('addon_') || combined.addon_key) continue;
      const tier = keyMatch?.[2] ?? combined.size_tier ?? combined.size;
      const size = Number(tier);
      const pay = size === 1 || size === 2 || size === 3 ? CONTRACTOR_SHINE_PAY[size as CanonSize] : null;
      if (!pay) {
        unresolved.push({ price_id: price.id, lookup_key: lookup, name, reason: 'vehicle_size_not_identified', pay_metadata: Object.fromEntries(Object.entries(md).filter(([k]) => /pay/.test(k))) });
        continue;
      }
      const kind = combined.visit_kind ?? combined.visit_type ?? '';
      const plan = keyMatch?.[1] === 'shine' || /shine complete/i.test(name);
      const detail = kind === 'full_detail' || /full detail/i.test(name);
      const count = Number(keyMatch?.[3] ?? combined.washes_per_month ?? 1);
      const wanted: Record<string, string> = plan
        ? { wash_pay: String(pay.maintenanceWash), detail_pay: String(pay.fullDetail) }
        : { contractor_pay: String(detail ? pay.fullDetail : pay.maintenanceWash * (count === 2 ? 2 : 1)) };
      // Existing per-job fields must agree; x2 contractor_pay remains monthly total.
      const perJob = detail && !plan ? pay.fullDetail : pay.maintenanceWash;
      for (const field of Object.keys(md)) {
        if (/^contractor_pay/.test(field)) wanted[field] = String(field === 'contractor_pay' && !plan ? Number(wanted.contractor_pay) : perJob * (field.endsWith('_cents') ? 100 : 1));
        if (/^(wash_pay|detail_pay)(?:_cents)?$/.test(field)) wanted[field] = String((field.startsWith('detail') ? pay.fullDetail : pay.maintenanceWash) * (field.endsWith('_cents') ? 100 : 1));
      }
      const before = Object.fromEntries(Object.keys(wanted).map((k) => [k, md[k] ?? null]));
      const needs = Object.entries(wanted).some(([k, v]) => md[k] !== v);
      if (needs) {
        if (apply) {
          const after = await stripe.prices.update(price.id, { metadata: wanted });
          if (after.unit_amount !== price.unit_amount || after.active !== price.active || Object.entries(wanted).some(([k,v]) => after.metadata[k] !== v)) throw new Error(`verification_failed:${price.id}`);
        }
        changed.push({ price_id: price.id, lookup_key: lookup, active: price.active, before, after: wanted, applied: apply });
      } else verified.push({ price_id: price.id, lookup_key: lookup, pay: wanted });
    }
    return jsonResponse({ ok: unresolved.length === 0, mode, apply, scanned, changed, verified, unresolved });
  } catch (error) {
    return jsonResponse({ ok: false, mode, changed, error: error instanceof Error ? error.message : 'pay_audit_failed' }, 500);
  }
});