// return-to-tier-1
// Admin-triggered: reverts a Tier 2 Pro back to Tier 1, updates Stripe pay-split
// metadata to 40%/$25, fires the T1-RETURN Brevo email, logs the action.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const Body = z.object({
  applicant_id: z.string().uuid(),
  reason: z.string().max(2000).optional(),
  stripe_account_id: z.string().optional(),
});

async function fireBrevo(templateKey: string, to: { email: string; name: string }, params: Record<string, unknown>) {
  if (!LOVABLE_API_KEY || !BREVO_API_KEY) return;
  const { data: setting } = await admin.from('app_settings').select('value').eq('key', templateKey).maybeSingle();
  const templateId = (setting?.value as any)?.id ?? (setting?.value as any);
  if (!templateId) return;
  await fetch('https://connector-gateway.lovable.dev/brevo/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': BREVO_API_KEY,
    },
    body: JSON.stringify({ templateId: Number(templateId), to: [to], params }),
  });
}

async function updateStripePaySplit(stripeAccountId: string | undefined) {
  if (!stripeAccountId || !STRIPE_KEY) return;
  const body = new URLSearchParams();
  body.append('metadata[pay_split_pct]', '40');
  body.append('metadata[visit_floor_cents]', '2500');
  body.append('metadata[tier]', 'tier_1_verified');
  await fetch(`https://api.stripe.com/v1/accounts/${stripeAccountId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return jsonResponse({ error: 'unauthorized' }, 401);
  const { data: hasRole } = await admin.rpc('has_role', { _user_id: uid, _role: 'admin' });
  if (!hasRole) return jsonResponse({ error: 'forbidden' }, 403);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ error: 'invalid_body' }, 400);

  const { data: a, error } = await admin.from('applicants')
    .select('id, first_name, last_name, email, tier')
    .eq('id', parsed.data.applicant_id).single();
  if (error || !a) return jsonResponse({ error: 'not_found' }, 404);
  if (a.tier !== 'tier_2_pro_partner') return jsonResponse({ error: 'not_tier_2' }, 400);

  const { error: updErr } = await admin.from('applicants').update({
    tier: 'tier_1_verified',
    tier_advanced_at: null,
    tier_readiness_status: 'not_eligible',
  }).eq('id', a.id);
  if (updErr) return jsonResponse({ error: 'update_failed', details: updErr.message }, 500);

  await admin.from('onboarding_events').insert({
    applicant_id: a.id,
    event: 'tier_returned_to_1',
    metadata: { reverted_by: uid, reason: parsed.data.reason ?? null },
  });

  await updateStripePaySplit(parsed.data.stripe_account_id);

  await fireBrevo('brevo_template_t1_return',
    { email: a.email, name: `${a.first_name} ${a.last_name}` },
    { first_name: a.first_name, reason: parsed.data.reason ?? '' });

  return jsonResponse({ ok: true, tier: 'tier_1_verified' });
});
