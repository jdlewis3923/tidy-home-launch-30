import '../_shared/http.ts';
// Admin-only. Visit hours live on each Stripe price's metadata (budget_hours,
// plus budget_hours_full_detail on Car Care). This writes the canonical values
// onto the EXISTING prices (found by lookup_key; amounts never touched), then
// reads the metadata back and copies it into sched_budget_hours, which is what
// the scheduler reads. POST { apply: false } (default) = dry run, no writes.
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { stripeSecretKey } from '../_shared/stripe-mode.ts';
import { CAR_WASH_LOOKUP_KEYS, SERVICE_LOOKUP_KEYS, type CanonSize } from '../_shared/pricing-canon.ts';

const SIZES: CanonSize[] = [1, 2, 3];
const HOURS = {
  cleaning: { 1: '2.25', 2: '3', 3: '4.25' },
  lawn: { 1: '0.6', 2: '0.9', 3: '1.5' },
  wash: { 1: '0.6', 2: '0.75', 3: '1' },
  detail: { 1: '3', 2: '3.5', 3: '4.5' },
} as const;

type Want = { meta: Record<string, string>; rows: { service: string; visit_kind: string; size_tier: number; field: string }[] };

function wanted(): Record<string, Want> {
  const w: Record<string, Want> = {};
  for (const service of ['cleaning', 'lawn'] as const) {
    for (const size of SIZES) {
      for (const cadence of ['monthly', 'biweekly', 'weekly'] as const) {
        w[SERVICE_LOOKUP_KEYS[service][size][cadence]] = {
          meta: { budget_hours: HOURS[service][size] },
          rows: [{ service, visit_kind: 'standard', size_tier: size, field: 'budget_hours' }],
        };
      }
    }
  }
  for (const size of SIZES) {
    w[SERVICE_LOOKUP_KEYS.detailing[size].monthly] = {
      meta: { budget_hours: HOURS.wash[size], budget_hours_full_detail: HOURS.detail[size] },
      rows: [
        { service: 'detailing', visit_kind: 'maintenance_wash', size_tier: size, field: 'budget_hours' },
        { service: 'detailing', visit_kind: 'full_detail', size_tier: size, field: 'budget_hours_full_detail' },
      ],
    };
    for (const n of [1, 2] as const) {
      w[CAR_WASH_LOOKUP_KEYS[size][n]] = {
        meta: { budget_hours: HOURS.wash[size] },
        rows: n === 1 ? [{ service: 'detailing', visit_kind: 'car_wash', size_tier: size, field: 'budget_hours' }] : [],
      };
    }
  }
  return w;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  const key = stripeSecretKey();
  if (!key) return jsonResponse({ ok: false, error: 'stripe_not_configured' }, 500);
  const apply = (await req.json().catch(() => ({})))?.apply === true;
  const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const want = wanted();
  const keys = Object.keys(want);
  const prices: Stripe.Price[] = [];
  for (let i = 0; i < keys.length; i += 10) {
    const page = await stripe.prices.list({ lookup_keys: keys.slice(i, i + 10), active: true, limit: 100 });
    prices.push(...page.data);
  }

  const changed: unknown[] = [];
  const unchanged: string[] = [];
  const upserts: Record<string, unknown>[] = [];
  for (const p of prices) {
    const w = want[p.lookup_key ?? ''];
    if (!w) continue;
    const before: Record<string, string | null> = {};
    for (const k of Object.keys(w.meta)) before[k] = p.metadata?.[k] ?? null;
    const needs = Object.entries(w.meta).some(([k, v]) => before[k] !== v);
    let meta = p.metadata ?? {};
    if (needs) {
      if (apply) meta = (await stripe.prices.update(p.id, { metadata: w.meta })).metadata ?? {};
      changed.push({ lookup_key: p.lookup_key, price_id: p.id, before, after: w.meta, applied: apply });
    } else unchanged.push(p.lookup_key!);
    // The scheduler copy is always what Stripe holds after this run.
    for (const r of w.rows) {
      const h = Number(apply ? meta[r.field] : (meta[r.field] ?? w.meta[r.field]));
      if (h > 0) upserts.push({ service: r.service, visit_kind: r.visit_kind, size_tier: r.size_tier, hours: h, source_lookup_key: p.lookup_key, synced_at: new Date().toISOString() });
    }
  }
  const missing = keys.filter((k) => !prices.some((p) => p.lookup_key === k));
  if (apply && upserts.length) {
    const unique = [...new Map(upserts.map((u) => [`${u.service}|${u.visit_kind}|${u.size_tier}`, u])).values()];
    const { error } = await admin.from('sched_budget_hours').upsert(unique, { onConflict: 'service,visit_kind,size_tier' });
    if (error) return jsonResponse({ ok: false, error: error.message, changed }, 500);
    // Deep clean is computed (1.5x standard); old size-0 car wash row is superseded by sized rows.
    await admin.from('sched_budget_hours').delete().eq('visit_kind', 'quarterly_deep_clean');
    await admin.from('sched_budget_hours').delete().eq('visit_kind', 'car_wash').eq('size_tier', 0);
  }
  return jsonResponse({ ok: true, apply, changed, unchanged, missing, scheduler_rows: upserts });
});
