// coi-decision — admin-only. Approves or rejects a COI submission, fires the
// matching Brevo template (T2-CONFIRMED on approve, COI-REJECTED on reject),
// Approval no longer promotes: Pro Partner is automatic on 50 visits · 4.8 · 60 days.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { readEnv } from '../_shared/handlerEnv.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { vendorFetch } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const Body = z.object({
  applicant_id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  notes: z.string().max(2000).optional(),
  stripe_account_id: z.string().optional(),
});

async function fireBrevoTemplate(templateId: number, to: { email: string; name: string }, params: Record<string, unknown>) {
  if (!LOVABLE_API_KEY || !BREVO_API_KEY) return { skipped: 'missing-brevo-keys' };
  // Contractor-ops (relationship) mail — marketing: false.
  const r = await sendBrevoEmail({
    to: [to], templateId, params, marketing: false,
    transport: 'gateway', label: 'coi-decision',
  });
  return { status: r.status ?? 0, sent: r.sent, reason: r.reason };
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  // Health probe: no side effect, reports which secrets are missing.
  if (req.method === 'GET') {
    const { missing } = readEnv([
      'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LOVABLE_API_KEY', 'BREVO_API_KEY',
    ] as const);
    return jsonResponse({ ok: missing.length === 0, function: 'coi-decision', missing_env: missing }, 200);
  }
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);


  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return jsonResponse({ error: 'unauthorized' }, 401);
  const { data: ok } = await admin.rpc('has_role', { _user_id: u.user.id, _role: 'admin' });
  if (!ok) return jsonResponse({ error: 'forbidden' }, 403);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ error: 'invalid_body' }, 400);

  const { data: a, error } = await admin
    .from('applicants')
    .select('id, first_name, last_name, email, tier')
    .eq('id', parsed.data.applicant_id)
    .single();
  if (error || !a) return jsonResponse({ error: 'not_found' }, 404);

  await admin
    .from('applicants')
    .update({
      coi_review_status: parsed.data.decision,
      coi_review_notes: parsed.data.notes ?? null,
    })
    .eq('id', a.id);

  // Brevo template IDs from app_settings (admin-configurable)
  const { data: s } = await admin
    .from('app_settings')
    .select('key,value')
    .in('key', ['brevo_template_t2_confirmed', 'brevo_template_coi_rejected']);
  const map: Record<string, number> = {};
  for (const r of s ?? []) {
    const v = r.value as { id?: number } | number;
    map[r.key] = typeof v === 'number' ? v : Number(v?.id ?? 0);
  }

  let brevo: unknown = null;
  let promote: unknown = null;

  if (parsed.data.decision === 'approved') {
    // Pro Partner no longer depends on insurance. It is granted automatically
    // at 50 visits · 4.8 average · 60 days active (pro_partner_try_promote).
    promote = { skipped: 'pro_partner_is_automatic' };
  } else {
    if (map.brevo_template_coi_rejected) {
      brevo = await fireBrevoTemplate(map.brevo_template_coi_rejected, { email: a.email, name: `${a.first_name} ${a.last_name}` }, {
        first_name: a.first_name, reason: parsed.data.notes ?? '',
      });
    }
  }

  await admin.from('onboarding_events').insert({
    applicant_id: a.id,
    event: parsed.data.decision === 'approved' ? 'coi_approved' : 'coi_rejected',
    metadata: { reviewer: u.user.id, notes: parsed.data.notes ?? null, brevo, promote },
  });

  return jsonResponse({ ok: true, decision: parsed.data.decision });
});
