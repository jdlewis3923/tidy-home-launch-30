// offer-tier-2-promotion
// Admin-triggered: marks an applicant's tier_readiness_status='offered',
// fires the Brevo T2-OFFER email, logs an onboarding_event.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
const Body = z.object({ applicant_id: z.string().uuid() });

async function fireBrevo(templateKey: string, to: { email: string; name: string }, params: Record<string, unknown>) {
  if (!LOVABLE_API_KEY || !BREVO_API_KEY) {
    console.warn('[offer-tier-2] brevo creds missing — skipping email');
    return;
  }
  const { data: setting } = await admin.from('app_settings').select('value').eq('key', templateKey).maybeSingle();
  const templateId = (setting?.value as any)?.id ?? (setting?.value as any);
  if (!templateId) {
    console.warn(`[offer-tier-2] template ${templateKey} not configured in app_settings`);
    return;
  }
  const res = await fetch('https://connector-gateway.lovable.dev/brevo/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': BREVO_API_KEY,
    },
    body: JSON.stringify({ templateId: Number(templateId), to: [to], params }),
  });
  if (!res.ok) console.error('[offer-tier-2] brevo failed', res.status, await res.text());
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  // Validate admin caller
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

  const { data: a, error: fetchErr } = await admin.from('applicants')
    .select('id, first_name, last_name, email, tier, completed_visits, avg_customer_rating')
    .eq('id', parsed.data.applicant_id).single();
  if (fetchErr || !a) return jsonResponse({ error: 'not_found' }, 404);
  if (a.tier !== 'tier_1_verified') return jsonResponse({ error: 'not_tier_1' }, 400);

  const now = new Date().toISOString();
  const { error: updErr } = await admin.from('applicants').update({
    tier_readiness_status: 'offered',
    tier_offer_sent_at: now,
    tier_offered_by: uid,
  }).eq('id', a.id);
  if (updErr) return jsonResponse({ error: 'update_failed', details: updErr.message }, 500);

  await admin.from('onboarding_events').insert({
    applicant_id: a.id,
    event: 'tier_2_offer_sent',
    metadata: { offered_by: uid, visits: a.completed_visits, rating: a.avg_customer_rating },
  });

  await fireBrevo('brevo_template_t2_offer',
    { email: a.email, name: `${a.first_name} ${a.last_name}` },
    {
      first_name: a.first_name,
      coi_upload_url: `${SUPABASE_URL.replace('.supabase.co', '')}/pro/upload-coi`,
      next_insurance_url: 'https://www.nextinsurance.com/general-liability-insurance/',
      deadline_days: 14,
    });

  return jsonResponse({ ok: true, applicant_id: a.id, tier_readiness_status: 'offered' });
});
