import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — daily Pro onboarding reminder, 9:15 AM ET.
 *
 * For every Pro with some but not all five items (background, insurance,
 * contract, sizes, badge photo): ONE email listing only what is still missing, with the same buttons as the welcome
 * email. Never one email per item.
 *
 * Cadence: a reminder at 2 days after the welcome email, another at 5 days,
 * then stop and raise an admin alert for Justin to call them instead.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { vendorFetch } from '../_shared/http.ts';
import { loadFive, FIVE_KEYS } from '../_shared/pro-five.ts';
import { missingEmail } from '../_shared/pro-emails.ts';
import { sendProEmail } from '../_shared/pro-send.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { SITE } from '../_shared/pro-onboarding.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DAY_MS = 86_400_000;
/** Days after the welcome email at which a reminder goes out. Then we stop. */
const REMINDER_DAYS = [2, 5];

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!(await isCronAuthorized(req))) {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  }

  const now = Date.now();
  const results: Array<Record<string, unknown>> = [];

  const { data: applicants, error } = await admin
    .from('applicants')
    .select('id, first_name, last_name, email, created_at, onboarding_email_sent_at, chase_count, chase_last_at, all_set_sent_at, is_test_row')
    .in('current_stage', ['offer', 'offer_sent', 'contract_signed', 'oriented'])
    .is('all_set_sent_at', null);

  if (error) {
    console.error('[pro-onboarding-reminders] query failed', error.message);
    return jsonResponse({ ok: false, error: 'query_failed', message: error.message }, 500);
  }

  for (const row of applicants ?? []) {
    const rec = await loadFive(admin, row.id, { mintTokens: true }).catch(() => null);
    if (!rec) continue;
    const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'This Pro';
    const doneCount = FIVE_KEYS.length - rec.missing.length;

    if (!rec.missing.length) {
      await vendorFetch(`${SUPABASE_URL}/functions/v1/pro-all-set`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ applicant_id: row.id }),
      }).catch(() => null);
      results.push({ applicant_id: row.id, action: 'all_set_checked' });
      continue;
    }
    // Only Pros with some — but not all — of the five.
    if (doneCount === 0) { results.push({ applicant_id: row.id, action: 'not_started' }); continue; }

    const since = new Date(row.onboarding_email_sent_at ?? row.created_at).getTime();
    const daysSince = Math.floor((now - since) / DAY_MS);
    const sentCount = row.chase_count ?? 0;
    const lastAt = row.chase_last_at ? new Date(row.chase_last_at).getTime() : 0;
    if (lastAt && now - lastAt < DAY_MS - 3_600_000) { results.push({ applicant_id: row.id, action: 'skipped_recent' }); continue; }

    if (sentCount >= REMINDER_DAYS.length) {
      await writeAlert(admin, {
        level: 'action',
        category: 'hiring',
        title: `${row.first_name ?? name} hasn't finished onboarding — give them a call`,
        body: `Two reminders have gone out and ${rec.missing.length} item(s) are still missing: ${rec.missing.join(', ')}. No more emails will be sent.`,
        action_label: 'Open the Pro record',
        action_url: `${SITE}/admin/applicants?applicant=${row.id}`,
        dedupe_key: `onboarding-stalled:${row.id}`,
      });
      await admin.from('applicants').update({ chase_alerted_at: new Date().toISOString() }).eq('id', row.id);
      results.push({ applicant_id: row.id, action: 'alerted' });
      continue;
    }

    const dueDay = REMINDER_DAYS[sentCount];
    if (daysSince < dueDay) { results.push({ applicant_id: row.id, action: 'not_due', days_since: daysSince }); continue; }
    if (!row.email) { results.push({ applicant_id: row.id, action: 'no_email' }); continue; }

    const built = missingEmail(row.first_name ?? 'there', rec.missing.map((k) => ({ key: k, url: rec.urls[k] })));
    const res = await sendProEmail(admin, { applicantId: row.id, key: 'missing', to: row.email, name: row.first_name ?? undefined, built, triggeredBy: 'pro-onboarding-reminders' });
    const nowIso = new Date().toISOString();
    if (res.sent) {
      await admin.from('applicants').update({ chase_count: sentCount + 1, chase_last_at: nowIso }).eq('id', row.id);
    } else {
      await writeAlert(admin, {
        level: 'warning',
        category: 'hiring',
        title: `Onboarding reminder email failed — ${name}`,
        body: `Still missing: ${rec.missing.join(', ')}. Email error: ${res.reason ?? 'send_failed'}.`,
        action_label: 'Open the Pro record',
        action_url: `${SITE}/admin/applicants?applicant=${row.id}`,
        dedupe_key: `onboarding-reminder-failed:${row.id}:${nowIso.slice(0, 10)}`,
      });
    }
    results.push({ applicant_id: row.id, action: res.sent ? 'reminded' : 'email_failed', day: dueDay, missing: rec.missing });
  }

  return jsonResponse({ ok: true, checked: applicants?.length ?? 0, results });
});
