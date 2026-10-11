import '../_shared/http.ts';
// Tidy — daily member operations.
// 1. member_ops_tick(): expires unused monthly gifts, grants this month's, reminds
//    with 5 days left, schedules car wash jobs, raises unassigned-car-wash alerts.
//    Every one of those is a database write first.
// 2. Then sends pending member notifications by email. A failed email only marks
//    the notification row failed — it never rolls back a gift, a job or a grant.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { tidyEmailShell } from '../_shared/email-brand.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  try {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
    const body = await req.json().catch(() => ({}));

    let tick: unknown = null;
    if (!body?.dispatch_only) {
      const { data, error } = await admin.rpc('member_ops_tick');
      if (error) throw new Error(`member_ops_tick: ${error.message}`);
      tick = data;
    }

    const { data: pending } = await admin.from('member_notifications')
      .select('id, user_id, kind, title, body, email_attempts')
      .in('email_status', ['pending', 'failed']).lt('email_attempts', 3)
      .order('created_at').limit(200);

    let sent = 0, failed = 0;
    for (const n of pending ?? []) {
      let status: 'sent' | 'failed' | 'skipped' = 'failed';
      let err: string | null = null;
      try {
        const { data: u } = await admin.auth.admin.getUserById(n.user_id);
        const email = u?.user?.email;
        const { data: prof } = await admin.from('profiles').select('language').eq('user_id', n.user_id).maybeSingle();
        const es = String(prof?.language ?? 'en').trim() === 'es';
        const SCHED = ['day_confirmed', 'pro_changed', 'visit_moved', 'waitlist_offer', 'day_change_needed', 'moved_to_waitlist', 'visit_reminder', 'choose_day'];
        const toSchedule = SCHED.includes(n.kind);
        if (!email) { status = 'skipped'; err = 'no email'; }
        else {
          const res = await sendBrevoEmail({
            to: [{ email }],
            marketing: false,
            subject: n.title,
            htmlContent: tidyEmailShell({
              heading: esc(n.title),
              eyebrow: 'Tidy Home Concierge',
              artTopic: n.kind.startsWith('car_wash') ? 'car care' : 'visit',
              bodyHtml: `<p style="font:16px/1.55 Arial,sans-serif;color:#334155">${esc(n.body)}</p>`,
              ctaUrl: toSchedule ? 'https://jointidy.co/dashboard/schedule' : 'https://jointidy.co/account',
              ctaLabel: toSchedule ? (es ? 'Abrir mi horario' : 'Open your schedule') : (es ? 'Abrir mi cuenta' : 'Open your account'),
            }),
            tags: ['member-notification', n.kind],
            label: `member-${n.kind}`,
          });
          status = res.sent ? 'sent' : 'failed';
          err = res.sent ? null : (res.reason ?? 'unknown');
        }
      } catch (e) { err = e instanceof Error ? e.message : String(e); }
      await admin.from('member_notifications').update({
        email_status: status, email_error: err, email_attempts: (n.email_attempts ?? 0) + 1,
      }).eq('id', n.id);
      if (status === 'sent') sent++; else if (status === 'failed') failed++;
    }
    if (failed > 0) {
      await admin.from('integration_logs').insert({ source: 'internal', event: 'member_ops_tick.notification_email_failed', status: 'error', error_message: `${failed} member emails failed` }).then(() => {}, () => {});
    }
    return jsonResponse({ ok: true, tick, sent, failed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[member-ops-tick]', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
