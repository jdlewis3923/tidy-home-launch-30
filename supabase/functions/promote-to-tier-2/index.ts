// promote-to-tier-2
// Called after a Pro uploads a valid $1M GL COI. Flips tier to tier_2_pro_partner,
// stamps tier_advanced_at, sets readiness=promoted, fires T2-CONFIRMED, logs.
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
  coi_document_id: z.string().optional(),
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

async function updateStripePaySplit(stripeAccountId: string | undefined, splitPct: number, floorCents: number) {
  if (!stripeAccountId || !STRIPE_KEY) return;
  // Update Connect account metadata so payout calculations pick up the new tier.
  const body = new URLSearchParams();
  body.append('metadata[pay_split_pct]', String(splitPct));
  body.append('metadata[visit_floor_cents]', String(floorCents));
  body.append('metadata[tier]', 'tier_2_pro_partner');
  const res = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccountId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) console.error('[promote] stripe update failed', res.status, await res.text());
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ error: 'invalid_body' }, 400);

  const { data: a, error } = await admin.from('applicants')
    .select('id, first_name, last_name, email, tier')
    .eq('id', parsed.data.applicant_id).single();
  if (error || !a) return jsonResponse({ error: 'not_found' }, 404);
  if (a.tier === 'tier_2_pro_partner') return jsonResponse({ ok: true, already: true });

  const now = new Date().toISOString();
  const { error: updErr } = await admin.from('applicants').update({
    tier: 'tier_2_pro_partner',
    tier_advanced_at: now,
    tier_readiness_status: 'promoted',
  }).eq('id', a.id);
  if (updErr) return jsonResponse({ error: 'update_failed', details: updErr.message }, 500);

  await admin.from('onboarding_events').insert({
    applicant_id: a.id,
    event: 'tier_2_promoted',
    metadata: { coi_document_id: parsed.data.coi_document_id ?? null },
  });

  await updateStripePaySplit(parsed.data.stripe_account_id, 45, 3000);

  await fireBrevo('brevo_template_t2_confirmed',
    { email: a.email, name: `${a.first_name} ${a.last_name}` },
    { first_name: a.first_name, pay_split: '45%', floor: '$30', stipend: '$300' });

  return jsonResponse({ ok: true, tier: 'tier_2_pro_partner', tier_advanced_at: now });
});
