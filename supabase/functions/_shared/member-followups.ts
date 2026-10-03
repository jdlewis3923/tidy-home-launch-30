// Post-visit follow-ups for members, plus Pro Partner auto-promotion.
//
// One place decides what a member hears after a visit:
//   - every completed visit: "how was your visit" text + email, both ending
//     with the 48-hour guarantee line; the email carries a one-tap
//     "Something wasn't right" button (/redo?t=<rate_token>).
//   - review ask by text after member visit 2; once more after visit 5 only
//     if they never tapped the first one; never again after that.
//   - referral ask by text the evening after member visit 3.
//   - a review ask and a referral ask never land in the same 7 days.
// Texts are parked in sms_outbox (quiet hours + release worker), never sent inline.
// deno-lint-ignore-file no-explicit-any
import { queueSms, isWindowOpen, nextOpenWindow } from './sms-window.ts';
import { preferenceAllows } from './sms-policy.ts';
import { sendBrevoEmail } from './brevo-send.ts';
import { tidyEmailShell, emailButton, TIDY_SITE, TIDY_OWNER_EMAIL } from './email-brand.ts';
import { notifyPro } from './pro-notify.ts';

export const GUARANTEE_REPLY_LINE = "Something not right? Reply here within 48 hours and we'll come back.";
export const GUARANTEE_REPLY_LINE_ES = '¿Algo no quedó bien? Responde aquí dentro de 48 horas y volvemos.';
const WEEK_MS = 7 * 86_400_000;

export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return raw.startsWith('+') && d.length >= 10 ? `+${d}` : null;
}

/** Next 5:30 PM Eastern at or after `from` (inside the 8–18 text window). */
export function eveningET(from: Date): Date {
  for (let addDays = 0; addDays < 3; addDays++) {
    const probe = new Date(from.getTime() + addDays * 86_400_000);
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(probe);
    // Try both DST offsets; keep the one that reads 17:30 in New York.
    for (const off of ['-04:00', '-05:00']) {
      const c = new Date(`${ymd}T17:30:00${off}`);
      const h = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(c);
      if (h === '17:30' && c.getTime() > from.getTime()) return isWindowOpen(c) ? c : nextOpenWindow(c);
    }
  }
  return nextOpenWindow(from);
}

function soon(from: Date, hours: number): Date {
  const t = new Date(from.getTime() + hours * 3_600_000);
  return isWindowOpen(t) ? t : nextOpenWindow(t);
}

type Visit = { id: string; user_id: string; rate_token?: string | null; service_type?: string | null; is_redo?: boolean | null };

async function loadMember(admin: any, userId: string) {
  const { data: p } = await admin.from('profiles')
    .select('first_name, phone, sms_opt_out, sms_preference, referral_code, language')
    .eq('user_id', userId).maybeSingle();
  const { data: u } = await admin.auth.admin.getUserById(userId);
  return { profile: p ?? null, email: u?.user?.email ?? null };
}

function canText(profile: any): string | null {
  if (!profile || profile.sms_opt_out) return null;
  if (!preferenceAllows(profile.sms_preference, 'post_visit_review').allow) return null;
  return toE164(profile.phone);
}

/** Called once, right after a visit is marked complete. Never throws. */
export async function afterVisitComplete(admin: any, visit: Visit, now = new Date()): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  try {
    const { profile, email } = await loadMember(admin, visit.user_id);
    const first = (profile?.first_name ?? '').trim() || 'there';
    const rateUrl = `${TIDY_SITE}/rate?t=${visit.rate_token ?? ''}`;
    const redoUrl = `${TIDY_SITE}/redo?t=${visit.rate_token ?? ''}`;
    const phone = canText(profile);
    const expires = new Date(now.getTime() + 48 * 3_600_000).toISOString();

    // 1. "How was your visit" text.
    if (phone) {
      const r = await queueSms(admin, {
        to_phone_e164: phone,
        body: `Hi ${first}, how was your Tidy visit today? Rate it in one tap: ${rateUrl}\n${GUARANTEE_REPLY_LINE}`,
        idempotency_key: `post_visit:${visit.id}`,
        template_name: 'post_visit_review',
        triggered_by: 'pro-visit-action',
        expires_at: expires,
      }, 'post_visit', soon(now, 1));
      out.post_visit_sms = r.queued ? 'queued' : r.error;
    } else out.post_visit_sms = 'no_phone_or_opted_out';

    // 2. "How was your visit" email with the one-tap redo button.
    if (email) {
      const html = tidyEmailShell({
        heading: 'How was your visit?',
        eyebrow: 'Your visit',
        previewText: 'One tap to rate it. Not right? We come back within 48 hours.',
        bodyHtml: `<p style="margin:0 0 12px">Hi ${first}, your Pro just finished today's visit. How did it go?</p>
          ${emailButton(rateUrl, 'Rate your visit')}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;width:100%"><tr><td style="border:1px solid #dbe4ef;border-radius:10px;padding:14px 16px;background:#f6f9fc;font:14px Arial,sans-serif;color:#0f172a">
            <b>&#10003; The 48-hour guarantee.</b> If anything isn't right, tell us within 48 hours and we'll send your Pro back to fix it, free.
            <div style="margin-top:12px"><a href="${redoUrl}" style="display:inline-block;padding:10px 16px;border:1px solid #0f172a;border-radius:8px;font-weight:700;color:#0f172a;text-decoration:none">Something wasn't right</a></div>
          </td></tr></table>
          <p style="margin:18px 0 0;color:#475569">${GUARANTEE_REPLY_LINE}</p>`,
        artTopic: 'your visit',
      });
      const r = await sendBrevoEmail({ to: email, marketing: false, subject: 'How was your Tidy visit?', htmlContent: html, tags: ['post-visit'], label: 'post-visit' });
      out.post_visit_email = r.sent ? 'sent' : r.reason;
    }

    // 3. Review / referral asks, by the member's count of real (non-redo) visits.
    const { count } = await admin.from('visits').select('id', { count: 'exact', head: true })
      .eq('user_id', visit.user_id).not('completed_at', 'is', null).eq('is_redo', false);
    const n = count ?? 0;
    out.member_visit_count = n;
    if (phone || email) {
      if (n === 2) out.review_ask = await queueAsk(admin, visit, 'review', 1, soon(now, 2), phone, first, profile, email);
      if (n === 5) {
        const { data: firstAsk } = await admin.from('member_asks').select('acted_at').eq('user_id', visit.user_id).eq('kind', 'review').eq('seq', 1).maybeSingle();
        out.review_ask = firstAsk && !firstAsk.acted_at
          ? await queueAsk(admin, visit, 'review', 2, soon(now, 2), phone, first, profile, email)
          : 'skipped_already_acted_or_never_asked';
      }
      if (n === 3 && phone) out.referral_ask = await queueAsk(admin, visit, 'referral', 1, eveningET(now), phone, first, profile, null);
    }
  } catch (e) {
    out.error = (e as Error).message;
    console.error('[member-followups] failed', out.error);
  }
  return out;
}

async function queueAsk(admin: any, visit: Visit, kind: 'review' | 'referral', seq: number, planned: Date, phone: string | null, first: string, profile: any, email: string | null = null) {
  // Never a review ask and a referral ask in the same week.
  const other = kind === 'review' ? 'referral' : 'review';
  const { data: others } = await admin.from('member_asks').select('release_after').eq('user_id', visit.user_id).eq('kind', other);
  let release = planned;
  for (const o of others ?? []) {
    const t = new Date(o.release_after).getTime();
    if (Math.abs(t - release.getTime()) < WEEK_MS) release = new Date(t + WEEK_MS);
  }
  if (release.getTime() !== planned.getTime()) release = kind === 'referral' ? eveningET(new Date(release.getTime() - 60_000)) : (isWindowOpen(release) ? release : nextOpenWindow(release));

  const { data: ask, error } = await admin.from('member_asks')
    .insert({ user_id: visit.user_id, kind, seq, visit_id: visit.id, release_after: release.toISOString(), status: 'queued' })
    .select('id').single();
  if (error) return (error as { code?: string }).code === '23505' ? 'already_asked' : error.message;

  const link = `${TIDY_SITE}/go/${ask.id}`;
  const body = kind === 'review'
    ? `Hi ${first}, glad your Tidy visits are going well. Would you leave us a quick Google review? One tap: ${link}`
    : `Hi ${first}, know a neighbor who'd like this? Give $50, get $50. One tap to share your link: ${link}`;
  const r = phone
    ? await queueSms(admin, {
        to_phone_e164: phone, body, idempotency_key: `ask:${ask.id}`, template_name: `${kind}_ask`, triggered_by: 'member-followups',
        expires_at: new Date(release.getTime() + 3 * 86_400_000).toISOString(),
      }, `${kind}_ask`, release)
    : { queued: false };
  // Review asks also go by email, released at the same moment, same one-tap link.
  let emailed = false;
  if (kind === 'review' && email) {
    const html = tidyEmailShell({
      heading: 'Would you leave us a Google review?', eyebrow: 'One tap',
      bodyHtml: `<p>Hi ${first}, glad your Tidy visits are going well. A quick Google review helps your neighbors find us.</p>${emailButton(link, 'Leave a Google review')}`,
      artTopic: 'review',
    });
    const e = await sendBrevoEmail({ to: email, marketing: false, subject: 'One tap: a quick Google review?', htmlContent: html,
      tags: ['review-ask'], label: `review-ask-${seq}`, scheduledAt: release.toISOString() }).catch(() => ({ sent: false }));
    emailed = !!(e as { sent?: boolean }).sent;
  }
  await admin.from('member_asks').update({ status: r.queued || emailed ? 'sent' : 'skipped' }).eq('id', ask.id);
  return { id: ask.id, release_after: release.toISOString(), queued: r.queued, emailed };
}

/** Promote to Pro Partner automatically when 50 visits · 4.8 · 60 days are all met. */
export async function maybePromoteProPartner(admin: any, applicantId: string | null | undefined): Promise<unknown> {
  if (!applicantId) return null;
  const { data, error } = await admin.rpc('pro_partner_try_promote', { _applicant: applicantId });
  if (error) { console.error('[pro-partner] check failed', error.message); return { error: error.message }; }
  if (data?.promoted) {
    const { data: a } = await admin.from('applicants').select('first_name, last_name, contractor_id').eq('id', applicantId).maybeSingle();
    if (a?.contractor_id) {
      await notifyPro(admin, {
        contractor_id: a.contractor_id, kind: 'pro_partner', title: "You're a Pro Partner",
        body: 'Your 10% raise is live from your next visit.', url: '/pro/schedule',
        idempotency_key: `pro_partner:${applicantId}`,
      }).catch(() => null);
    }
    await sendBrevoEmail({
      to: TIDY_OWNER_EMAIL, marketing: false,
      subject: `${a?.first_name ?? 'A Pro'} ${a?.last_name?.[0] ?? ''}. is now a Pro Partner`,
      htmlContent: tidyEmailShell({
        heading: 'New Pro Partner', eyebrow: 'Pro Partner',
        bodyHtml: `<p>${a?.first_name ?? 'A Pro'} met all three conditions — 50 completed visits, a 4.8 average rating and 60 days active. The 10% raise applied automatically and starts on their next visit. Nothing for you to approve.</p>`,
        artTopic: 'report',
      }),
      tags: ['pro-partner'], label: 'pro-partner-promoted',
    }).catch(() => null);
  }
  return data;
}
