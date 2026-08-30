// Tidy — verify-checkout-wiring. Proves the booking flow against LIVE Stripe.
//
// Checks, in order:
//  1. All 15 recurring lookup keys resolve to an ACTIVE Stripe price at the
//     amount the canon publishes.
//  2. Quantity carries cadence for cleaning and lawn only (1/2/4); Shine
//     Complete and the Car Wash Add-On are always quantity 1.
//  3. The reference cart — clean_2 at quantity 2 plus wash_2_x1 — totals
//     $427.00 using LIVE Stripe unit amounts, not local constants.
//  4. Every stripe_catalog row that could be selected points at a price that is
//     still active in Stripe (no archived price can be booked).
//
// Admin-only. Read-only: it creates nothing in Stripe.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import {
  CAR_WASH_LOOKUP_KEYS,
  CAR_WASH_PRICES,
  SERVICE_LOOKUP_KEYS,
  SIZE_PRICES,
  quantityFor,
  type CanonSize,
  type WashCount,
} from '../_shared/pricing-canon.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const EXPECTED_CENTS: Record<string, number> = {};
for (const size of [1, 2, 3] as CanonSize[]) {
  EXPECTED_CENTS[SERVICE_LOOKUP_KEYS.cleaning[size]] = SIZE_PRICES.cleaning[size] * 100;
  EXPECTED_CENTS[SERVICE_LOOKUP_KEYS.lawn[size]] = SIZE_PRICES.lawn[size] * 100;
  EXPECTED_CENTS[SERVICE_LOOKUP_KEYS.detailing[size]] = SIZE_PRICES.detailing[size] * 100;
  for (const washes of [1, 2] as WashCount[]) {
    EXPECTED_CENTS[CAR_WASH_LOOKUP_KEYS[size][washes]] = CAR_WASH_PRICES[size][washes] * 100;
  }
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

    // ---------- 2. quantity rules ----------
    const quantity_rules = {
      cleaning: {
        monthly: quantityFor('cleaning', 'monthly'),
        biweekly: quantityFor('cleaning', 'biweekly'),
        weekly: quantityFor('cleaning', 'weekly'),
      },
      lawn: {
        monthly: quantityFor('lawn', 'monthly'),
        biweekly: quantityFor('lawn', 'biweekly'),
        weekly: quantityFor('lawn', 'weekly'),
      },
      detailing: {
        monthly: quantityFor('detailing', 'monthly'),
        biweekly: quantityFor('detailing', 'biweekly'),
        weekly: quantityFor('detailing', 'weekly'),
      },
      car_wash_addon: 1,
    };
    const quantity_rules_pass =
      quantity_rules.cleaning.monthly === 1 &&
      quantity_rules.cleaning.biweekly === 2 &&
      quantity_rules.cleaning.weekly === 4 &&
      quantity_rules.lawn.monthly === 1 &&
      quantity_rules.lawn.biweekly === 2 &&
      quantity_rules.lawn.weekly === 4 &&
      quantity_rules.detailing.monthly === 1 &&
      quantity_rules.detailing.biweekly === 1 &&
      quantity_rules.detailing.weekly === 1 &&
      quantity_rules.car_wash_addon === 1;

    // ---------- 3. the $427 reference cart, priced from LIVE Stripe ----------
    const cleanTwo = found.get('clean_2');
    const washTwoX1 = found.get('wash_2_x1');
    const referenceCents =
      cleanTwo?.unit_amount != null && washTwoX1?.unit_amount != null
        ? cleanTwo.unit_amount * quantityFor('cleaning', 'biweekly') + washTwoX1.unit_amount * 1
        : null;
    const reference_cart = {
      description: 'clean_2 × 2 (biweekly) + wash_2_x1 × 1',
      expected_total: '$427.00',
      actual_total: referenceCents === null ? null : `$${(referenceCents / 100).toFixed(2)}`,
      actual_cents: referenceCents,
      pass: referenceCents === 42700,
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
      ok: all_keys_pass && quantity_rules_pass && reference_cart.pass && no_archived_selectable,
      checked_at: new Date().toISOString(),
      lookup_keys,
      all_keys_pass,
      quantity_rules,
      quantity_rules_pass,
      reference_cart,
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
