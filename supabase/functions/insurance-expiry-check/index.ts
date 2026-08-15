// insurance-expiry-check — daily cron (13:00 UTC).
//
// Continuing compliance AFTER onboarding. For every VERIFIED contractor policy:
//   * 30 / 14 / 7 days before expiration → reminder (deduped via reminders_sent)
//   * on/after expiration                → status flips to `expired`
//   * inside 30 days                      → applicants.insurance_status = 'expiring_soon'
//
// Expiring/expired coverage never disables an account — it only removes job
// eligibility (see public.is_contractor_job_eligible).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const MILESTONES = [30, 14, 7];

async function templateId(key: string): Promise<number> {
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle();
  const raw = data?.value as any;
  return Number(raw?.id ?? raw ?? 0);
}

async function fireBrevo(id: number, to: { email: string; name: string }, params: Record<string, unknown>) {
  if (!LOVABLE_API_KEY || !BREVO_API_KEY || !id) return;
  await fetch('https://connector-gateway.lovable.dev/brevo/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': BREVO_API_KEY },
    body: JSON.stringify({ templateId: id, to: [to], params }),
  }).catch((e) => console.error('[insurance-expiry] brevo failed', e));
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const [remindTpl, expiredTpl] = await Promise.all([
    templateId('brevo_template_insurance_expiring'),
    templateId('brevo_template_insurance_expired'),
  ]);

  const { data: rows } = await admin
    .from('contractor_insurance')
    .select('id, applicant_id, expiration_date, verification_status, reminders_sent, carrier_name')
    .in('verification_status', ['verified', 'expiring_soon'])
    .not('expiration_date', 'is', null)
    .lte('expiration_date', horizon);

  let reminded = 0;
  let expired = 0;

  for (const r of rows ?? []) {
    const exp = String(r.expiration_date);
    const daysLeft = Math.ceil((new Date(exp + 'T00:00:00Z').getTime() - new Date(todayStr + 'T00:00:00Z').getTime()) / 86400000);

    const { data: a } = r.applicant_id
      ? await admin.from('applicants').select('id, email, first_name, last_name').eq('id', r.applicant_id).maybeSingle()
      : { data: null };

    if (daysLeft <= 0) {
      await admin.from('contractor_insurance').update({ verification_status: 'expired' }).eq('id', r.id);
      if (a?.id) await admin.from('applicants').update({ insurance_status: 'expired' }).eq('id', a.id);
      if (a?.email) {
        await fireBrevo(expiredTpl, { email: a.email, name: `${a.first_name} ${a.last_name}` }, {
          first_name: a.first_name, expiration_date: exp,
        });
      }
      if (a?.id) {
        await admin.from('onboarding_events').insert({
          applicant_id: a.id, event: 'insurance_expired', metadata: { expiration_date: exp },
        });
      }
      expired++;
      continue;
    }

    const sent: number[] = Array.isArray(r.reminders_sent) ? (r.reminders_sent as number[]) : [];
    const due = MILESTONES.find((m) => daysLeft <= m && !sent.includes(m));

    await admin
      .from('contractor_insurance')
      .update({
        verification_status: 'expiring_soon',
        ...(due ? { reminders_sent: [...sent, due] } : {}),
      })
      .eq('id', r.id);
    if (a?.id) await admin.from('applicants').update({ insurance_status: 'expiring_soon' }).eq('id', a.id);

    if (due && a?.email) {
      await fireBrevo(remindTpl, { email: a.email, name: `${a.first_name} ${a.last_name}` }, {
        first_name: a.first_name, expiration_date: exp, days_left: daysLeft, carrier_name: r.carrier_name ?? null,
      });
      reminded++;
    }
  }

  return jsonResponse({ ok: true, checked: rows?.length ?? 0, reminded, expired });
});
