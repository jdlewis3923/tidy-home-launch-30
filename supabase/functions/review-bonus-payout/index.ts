// Tidy — Review Bonus payout run.
//
// Body: { period: 'YYYY-MM' } (defaults to current month).
//
// Pays all `pending` public.pro_bonuses rows for the period via Stripe
// Connect. Each Pro gets exactly ONE transfer per period for their review
// bonuses — this is always a separate transfer from job/visit pay, described
// as "Review bonus (N reviews)". Never folds into another payout.
//
// Idempotency: Stripe Idempotency-Key = `${pro_id}:${period}:review_bonus`,
// so a retried run cannot double-pay even if the DB write failed after a
// successful transfer. Bonus rows are only ever moved out of 'pending' once,
// guarded by `.eq('status', 'pending')` on the update.
//
// If a Pro has no connected account or is not payouts-enabled, their rows are
// left as 'pending' (or flipped to 'blocked' with blocked_reason) — no
// transfer is attempted for them.
//
// Auth: service-role via x-cron-key OR an authenticated admin JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { isValidStripeSecretKey, stripeSecretKeyError } from '../_shared/stripe-keys.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const STRIPE_CONNECT_API_KEY = Deno.env.get('STRIPE_CONNECT_API_KEY') ?? '';

const BLOCKED_REASON = 'blocked — Connect onboarding incomplete.';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return false;
    const { data } = await admin.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

async function stripeTransfer(destination: string, amountCents: number, description: string, idempotencyKey: string) {
  const body = new URLSearchParams({
    amount: String(amountCents),
    currency: 'usd',
    destination,
    description,
    'metadata[reason]': 'review_bonus',
  }).toString();
  const res = await fetch('https://api.stripe.com/v1/transfers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_CONNECT_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `stripe transfer failed (${res.status})`);
  }
  return json as { id: string };
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authorized = (await isCronAuthorized(req)) || (await isAdminRequest(req));
  if (!authorized) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  if (!isValidStripeSecretKey(STRIPE_CONNECT_API_KEY)) {
    const { reason } = stripeSecretKeyError('STRIPE_CONNECT_API_KEY');
    return jsonResponse({ ok: false, error: 'stripe_connect_invalid_key', reason }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const period: string = /^\d{4}-\d{2}$/.test(body?.period) ? body.period : currentPeriod();

  const { data: pending, error: pendErr } = await admin
    .from('pro_bonuses')
    .select('id, pro_id, amount_cents, review_id')
    .eq('status', 'pending')
    .eq('period', period)
    .limit(1000);
  if (pendErr) return jsonResponse({ ok: false, error: pendErr.message }, 500);

  const byPro = new Map<string, { rows: typeof pending; total: number }>();
  for (const row of pending ?? []) {
    const key = row.pro_id as string;
    const entry = byPro.get(key) ?? { rows: [] as typeof pending, total: 0 };
    entry.rows.push(row);
    entry.total += row.amount_cents as number;
    byPro.set(key, entry);
  }

  const proIds = [...byPro.keys()];
  const { data: pros } = proIds.length
    ? await admin.from('applicants').select('id, stripe_account_id, stripe_connect_complete').in('id', proIds)
    : { data: [] as { id: string; stripe_account_id: string | null; stripe_connect_complete: boolean }[] };
  const proById = new Map((pros ?? []).map((p) => [p.id, p]));

  const results: Array<{ pro_id: string; status: string; amount_cents: number; transfer_id?: string; reason?: string }> = [];

  for (const [proId, entry] of byPro) {
    const pro = proById.get(proId);
    const rowIds = entry.rows.map((r) => r.id);
    const reviewIds = entry.rows.map((r) => r.review_id).filter((id): id is string => !!id);

    if (!pro?.stripe_account_id || !pro.stripe_connect_complete) {
      await admin
        .from('pro_bonuses')
        .update({ status: 'blocked', blocked_reason: BLOCKED_REASON })
        .in('id', rowIds)
        .eq('status', 'pending');
      results.push({ pro_id: proId, status: 'blocked', amount_cents: entry.total, reason: BLOCKED_REASON });
      continue;
    }

    const idempotencyKey = `${proId}:${period}:review_bonus`;
    const description = `Review bonus (${entry.rows.length} review${entry.rows.length === 1 ? '' : 's'})`;
    try {
      const transfer = await stripeTransfer(pro.stripe_account_id, entry.total, description, idempotencyKey);
      const paidAt = new Date().toISOString();

      const { data: updated } = await admin
        .from('pro_bonuses')
        .update({ status: 'paid', stripe_transfer_id: transfer.id, paid_at: paidAt })
        .in('id', rowIds)
        .eq('status', 'pending')
        .select('id');

      if (reviewIds.length > 0) {
        await admin.from('reviews').update({ status: 'paid', paid_at: paidAt }).in('id', reviewIds);
      }

      results.push({ pro_id: proId, status: 'paid', amount_cents: entry.total, transfer_id: transfer.id });

      await admin.from('integration_logs').insert({
        source: 'internal',
        event: `review_bonus_payout:${proId}:${period}`,
        status: 'success',
        payload_hash: `transfer=${transfer.id} rows=${updated?.length ?? 0} amount=${entry.total}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      results.push({ pro_id: proId, status: 'error', amount_cents: entry.total, reason: message });
      await admin.from('integration_logs').insert({
        source: 'internal',
        event: `review_bonus_payout:${proId}:${period}`,
        status: 'error',
        error_message: message.slice(0, 1000),
      });
    }
  }

  return jsonResponse({ ok: true, period, pros_processed: results.length, results });
});
