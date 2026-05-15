// coi-expiry-check — daily cron. Finds Pros whose COI is expiring within 30 days
// or already expired, fires Brevo COI-EXPIRING reminder, and flips status to
// expired when past the date. Best-effort.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

async function fireBrevo(id: number, to: { email: string; name: string }, params: Record<string, unknown>) {
  if (!LOVABLE_API_KEY || !BREVO_API_KEY || !id) return;
  await fetch('https://connector-gateway.lovable.dev/brevo/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': BREVO_API_KEY },
    body: JSON.stringify({ templateId: id, to: [to], params }),
  });
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;

  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const { data: settings } = await admin.from('app_settings').select('key,value').in('key', ['brevo_template_coi_expiring']);
  const tplId = (() => {
    const row = settings?.find((s) => s.key === 'brevo_template_coi_expiring');
    if (!row) return 0;
    const v = row.value as any;
    return typeof v === 'number' ? v : Number(v?.id ?? 0);
  })();

  // Expiring soon
  const { data: expiringSoon } = await admin
    .from('applicants')
    .select('id, first_name, last_name, email, coi_expires_at, coi_review_status')
    .lte('coi_expires_at', in30)
    .gt('coi_expires_at', todayStr)
    .eq('coi_review_status', 'approved');

  for (const a of expiringSoon ?? []) {
    await fireBrevo(tplId, { email: a.email, name: `${a.first_name} ${a.last_name}` }, {
      first_name: a.first_name, expires_at: a.coi_expires_at,
    });
  }

  // Already expired — flip status
  const { data: expired } = await admin
    .from('applicants')
    .select('id')
    .lt('coi_expires_at', todayStr)
    .eq('coi_review_status', 'approved');
  if (expired?.length) {
    await admin.from('applicants').update({ coi_review_status: 'expired' }).in('id', expired.map((e) => e.id));
  }

  return jsonResponse({ ok: true, reminded: expiringSoon?.length ?? 0, expired: expired?.length ?? 0 });
});
