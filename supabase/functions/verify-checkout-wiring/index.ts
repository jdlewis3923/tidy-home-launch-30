import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — verify-checkout-wiring. Proves the booking flow against LIVE Stripe.
//
// Checks, in order:
//  1. Every recurring lookup key the canon publishes — five cleaning bands
//     (monthly + annual), three lawn bands, three Shine Complete plans —
//     resolves to an ACTIVE Stripe price at the exact canon amount.
//  2. Quantity carries nothing: cadence lives in the lookup key, so every
//     plan line is quantity 1.
//  3. Reference carts priced from LIVE Stripe unit amounts, not local
//     constants: a standard bundle and an Estate plan.
//  4. Every stripe_catalog row that could be selected points at a price that
//     is still active in Stripe (no archived price can be booked).
//
// Admin-only. Read-only: it creates nothing in Stripe.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import {
  ALL_RECURRING_LOOKUP_KEYS,
  BILLED_MONTHLY,
  CADENCES,
  CLEANING_MONTHLY,
  CLEANING_SIZES,
  SHINE_MONTHLY,
  SIZES,
  cleaningAnnualCents,
  cleaningLookupKey,
  lookupKeyFor,
  quantityFor,
  type CanonCadence,
  type CanonService,
} from '../_shared/pricing-canon.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Every recurring key the site can resolve, with the exact amount the canon
// publishes. Cleaning uses the five square-foot bands; lawn and Car Care keep
// their three existing sizes. Annual keys bill 12 × monthly × 0.90 once a year.
const EXPECTED_CENTS: Record<string, number> = {};
for (const size of CLEANING_SIZES) {
  for (const cadence of CADENCES) {
    EXPECTED_CENTS[cleaningLookupKey(size, cadence)] = CLEANING_MONTHLY[size][cadence] * 100;
    EXPECTED_CENTS[cleaningLookupKey(size, cadence, true)] = cleaningAnnualCents(size, cadence);
  }
}
for (const size of SIZES) {
  for (const cadence of CADENCES) {
    EXPECTED_CENTS[lookupKeyFor('lawn', size, cadence)] = BILLED_MONTHLY.lawn[size][cadence] * 100;
  }
  EXPECTED_CENTS[lookupKeyFor('detailing', size, 'monthly')] = SHINE_MONTHLY[size] * 100;
}
const ALL_KEYS = Object.keys(EXPECTED_CENTS);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (!STRIPE_SECRET_KEY) return jsonResponse({ ok: false, error: 'Stripe not configured' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Service-role callers (CI / cron) have no user; admins must prove the role.
  if (userData?.user) {
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });
    if (isAdmin !== true) return jsonResponse({ ok: false, error: 'forbidden — admin role required' }, 403);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    // ---------- 1. lookup keys ----------
    const found = new Map<string, { id: string; unit_amount: number | null; active: boolean; recurring: boolean }>();
    for (let i = 0; i < ALL_KEYS.length; i += 10) {
      const chunk = ALL_KEYS.slice(i, i + 10);
      const list = await stripe.prices.list({ lookup_keys: chunk, active: true, limit: 100 });
      for (const p of list.data) {
        if (!p.lookup_key) continue;
        found.set(p.lookup_key, {
          id: p.id,
          unit_amount: p.unit_amount,
          active: p.active,
          recurring: !!p.recurring,
        });
      }
    }

    const lookup_keys = ALL_KEYS.map((key) => {
      const hit = found.get(key);
      const expected = EXPECTED_CENTS[key];
      const pass = !!hit && hit.active && hit.recurring && hit.unit_amount === expected;
      return {
        lookup_key: key,
        pass,
        price_id: hit?.id ?? null,
        expected_cents: expected,
        stripe_cents: hit?.unit_amount ?? null,
        recurring: hit?.recurring ?? false,
      };
    });
    const all_keys_pass = lookup_keys.every((k) => k.pass);
    const canon_key_count = ALL_RECURRING_LOOKUP_KEYS.length;
    const keys_match_canon = ALL_KEYS.length === canon_key_count &&
      ALL_RECURRING_LOOKUP_KEYS.every((key) => key in EXPECTED_CENTS);

    // ---------- 2. quantity rules: every plan line is quantity 1 ----------
    const quantity_rules = {
      cleaning: { monthly: quantityFor('cleaning', 'monthly'), biweekly: quantityFor('cleaning', 'biweekly'), weekly: quantityFor('cleaning', 'weekly') },
      lawn: { monthly: quantityFor('lawn', 'monthly'), biweekly: quantityFor('lawn', 'biweekly'), weekly: quantityFor('lawn', 'weekly') },
      detailing: { monthly: quantityFor('detailing', 'monthly'), biweekly: quantityFor('detailing', 'biweekly'), weekly: quantityFor('detailing', 'weekly') },
    };
    const quantity_rules_pass = (['cleaning', 'lawn', 'detailing'] as CanonService[]).every((svc) =>
      CADENCES.every((cad) => quantityFor(svc, cad) === 1),
    );

    // ---------- 3. reference carts, priced from LIVE Stripe ----------
    // Standard bundle: size 2 cleaning biweekly ($348) + size 1 lawn monthly
    // ($45) = $393.00. Square-foot bands replaced surcharges — no extra line.
    const cleanTwoBiweekly = found.get(lookupKeyFor('cleaning', 2, 'biweekly'));
    const lawnOneMonthly = found.get(lookupKeyFor('lawn', 1, 'monthly'));
    const bundleCents =
      cleanTwoBiweekly?.unit_amount != null && lawnOneMonthly?.unit_amount != null
        ? cleanTwoBiweekly.unit_amount + lawnOneMonthly.unit_amount
        : null;
    const bundle_cart = {
      description: 'clean_2_biweekly + lawn_1_monthly',
      expected_total: '$393.00',
      actual_total: bundleCents === null ? null : `$${(bundleCents / 100).toFixed(2)}`,
      actual_cents: bundleCents,
      pass: bundleCents === 39300,
    };

    // Estate: 3,200–4,800 sq ft weekly = $1,396.00 a month, no surcharge.
    const estateWeekly = found.get(cleaningLookupKey(4, 'weekly'));
    const estate_cart = {
      description: 'clean_estate_weekly',
      expected_total: '$1,396.00',
      actual_total: estateWeekly?.unit_amount == null ? null : `$${(estateWeekly.unit_amount / 100).toFixed(2)}`,
      actual_cents: estateWeekly?.unit_amount ?? null,
      pass: estateWeekly?.unit_amount === 139600,
    };

    // ---------- 4. no archived price is selectable ----------
    const { data: catalogRows, error: catErr } = await supabase
      .from('stripe_catalog')
      .select('lookup_key, addon_name, stripe_price_id, active')
      .eq('active', true);
    if (catErr) throw new Error(`stripe_catalog read failed: ${catErr.message}`);

    const archived: Array<{ price_id: string; label: string }> = [];
    for (const row of catalogRows ?? []) {
      const priceId = row.stripe_price_id as string | null;
      if (!priceId) continue;
      try {
        const price = await stripe.prices.retrieve(priceId);
        if (!price.active) {
          archived.push({ price_id: priceId, label: (row.lookup_key ?? row.addon_name ?? '?') as string });
        }
      } catch {
        archived.push({ price_id: priceId, label: (row.lookup_key ?? row.addon_name ?? '?') as string });
      }
    }

    const no_archived_selectable = archived.length === 0;

    return jsonResponse({
      ok: all_keys_pass && keys_match_canon && quantity_rules_pass && bundle_cart.pass && estate_cart.pass && no_archived_selectable,
      checked_at: new Date().toISOString(),
      lookup_keys,
      all_keys_pass,
      keys_match_canon,
      quantity_rules,
      quantity_rules_pass,
      bundle_cart,
      estate_cart,
      active_catalog_rows: catalogRows?.length ?? 0,
      archived_but_selectable: archived,
      no_archived_selectable,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[verify-checkout-wiring] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
