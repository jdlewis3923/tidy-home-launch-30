// Tidy — Applicant Stale Nudge (cron, daily)
//
// Scans applicants whose stage hasn't changed in N days and is not 'active'
// or 'rejected'. Fires nudge emails on day 7 (check-in) and day 14 (last call),
// and auto-rejects on day 30.
//
// Triggered by pg_cron once daily. Idempotent: uses onboarding_events to
// suppress duplicate nudges for the same day-bucket.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail, brandedEmailHtml } from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Bucket = 'day_7' | 'day_14' | 'day_30';

function daysAgo(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

async function alreadyNudgedToday(applicantId: string, bucket: Bucket): Promise<boolean> {
  const since = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('onboarding_events')
    .select('id')
    .eq('applicant_id', applicantId)
    .eq('event', `stale_nudge_${bucket}`)
    .gte('created_at', since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;

  const { data: rows, error } = await admin
    .from('applicants')
    .select('id, first_name, email, current_stage, stage_entered_at')
    .not('current_stage', 'in', '(active,rejected)')
    .order('stage_entered_at', { ascending: true })
    .limit(500);

  if (error) return jsonResponse({ error: error.message }, 500);

  const result: Record<string, number> = { day_7: 0, day_14: 0, day_30: 0, skipped: 0 };

  for (const a of rows ?? []) {
    const d = daysAgo(a.stage_entered_at);
    let bucket: Bucket | null = null;
    if (d >= 30) bucket = 'day_30';
    else if (d >= 14) bucket = 'day_14';
    else if (d >= 7) bucket = 'day_7';
    if (!bucket) continue;

    if (await alreadyNudgedToday(a.id, bucket)) { result.skipped++; continue; }

    if (bucket === 'day_30') {
      await admin.from('applicants').update({
        current_stage: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: 'Auto-rejected: 30 days inactive',
        updated_at: new Date().toISOString(),
      }).eq('id', a.id);

      const html = brandedEmailHtml({
        heading: 'Your Tidy application',
        bodyHtml: `<p>Hi ${a.first_name ?? 'there'},</p><p>We didn't hear back after a few check-ins, so we've closed your application for now. If you'd like to re-apply in the future, you're always welcome.</p>`,
      });
      await sendBrevoEmail({
        toEmail: a.email, toName: a.first_name ?? '',
        subject: 'Your Tidy application',
        htmlContent: html, tags: ['applicant-stale-auto-reject'],
        templateName: 'applicant-stale-auto-reject', triggeredBy: 'applicant-stale-nudge',
      }).catch(() => {});
    } else {
      const isLast = bucket === 'day_14';
      const html = brandedEmailHtml({
        heading: isLast ? 'Last call from Tidy' : 'Still interested in joining Tidy?',
        bodyHtml: isLast
          ? `<p>Hi ${a.first_name ?? 'there'},</p><p>This is our last check-in. If we don't hear back within 2 weeks we'll close your application — but reply or click below and we'll keep things moving.</p>`
          : `<p>Hi ${a.first_name ?? 'there'},</p><p>Just checking in — your Tidy application has been sitting for a week. If you're still interested, reply to this email and we'll pick things back up.</p>`,
        ctaUrl: 'https://jointidy.co/onboarding', ctaLabel: 'Resume my application',
      });
      await sendBrevoEmail({
        toEmail: a.email, toName: a.first_name ?? '',
        subject: isLast ? 'Last call from Tidy' : 'Still interested in joining Tidy?',
        htmlContent: html, tags: [`applicant-nudge-${bucket}`],
        templateName: `applicant-nudge-${bucket}`, triggeredBy: 'applicant-stale-nudge',
      }).catch(() => {});
    }

    await admin.from('onboarding_events').insert({
      applicant_id: a.id,
      event: `stale_nudge_${bucket}`,
      metadata: { days_inactive: d, stage: a.current_stage },
    });
    result[bucket]++;
  }

  return jsonResponse({ ok: true, ...result });
});
