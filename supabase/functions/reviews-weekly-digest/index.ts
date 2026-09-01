// Tidy — Weekly Review Bonus digest + promotion/expiry sweep.
//
// Runs Mondays 8:00 AM ET (12:00 UTC) via pg_cron → x-cron-key auth.
//
// Steps:
//   1. Attribution: re-scores any review still sitting at status='new' with no
//      matched pro, using the shared `_shared/review-attribution.ts` engine
//      (the same one reviews-import uses). High confidence populates
//      matched_pro_id and flips status to 'matched'. Never auto-approves.
//   2. Promotion: reviews with status='matched', stars=5, a non-excluded
//      reviewer_name, posted_at older than hold_days, whose matched_pro is
//      still under cap_per_month for the current calendar month → flipped to
//      'awaiting_approval'. Bounded batch, idempotent (status guard means a
//      retried run is a no-op for already-moved rows).
//   3. Expiry: anything untouched (status not in paid/rejected/expired) for
//      30+ days since posted_at → 'expired'.
//   4. Admin digest via Brevo linking to /admin/reviews.
//
// Auth: service-role only via x-cron-key (isCronAuthorized), matching every
// other scheduled function in this project.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { attribute, type AttributionCandidate } from '../_shared/review-attribution.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALERT_FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') ?? 'alerts@jointidy.co';
const ADMIN_BASE_URL = Deno.env.get('ADMIN_BASE_URL') ?? 'https://jointidy.co';

const BATCH_SIZE = 200;
const EXPIRE_DAYS = 30;
const CANDIDATE_WINDOW_DAYS = 14;

type ReviewBonusPolicy = {
  amount_cents: number;
  cap_per_month: number;
  hold_days: number;
  excluded_reviewer_names: string[];
};

const DEFAULT_POLICY: ReviewBonusPolicy = {
  amount_cents: 2500,
  cap_per_month: 4,
  hold_days: 7,
  excluded_reviewer_names: [],
};

function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getAdminEmails(admin: ReturnType<typeof createClient>): Promise<string[]> {
  const { data: roles } = await admin.from('user_roles').select('user_id').eq('role', 'admin');
  const ids = (roles ?? []).map((r: { user_id: string }) => r.user_id);
  const emails: string[] = [];
  for (const uid of ids) {
    try {
      // deno-lint-ignore no-explicit-any
      const { data } = await (admin as any).auth.admin.getUserById(uid);
      if (data.user?.email) emails.push(data.user.email);
    } catch { /* skip */ }
  }
  return emails;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!(await isCronAuthorized(req))) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Scheduler-wide kill switch — same convention as other cron-driven jobs.
  const { data: pausedSetting } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'scheduler_paused')
    .maybeSingle();
  if (pausedSetting?.value === true) {
    return jsonResponse({ ok: true, skipped: 'scheduler_paused' });
  }

  const { data: policySetting } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'review_bonus')
    .maybeSingle();
  const policy: ReviewBonusPolicy = { ...DEFAULT_POLICY, ...(policySetting?.value as Partial<ReviewBonusPolicy> ?? {}) };
  const excluded = new Set((policy.excluded_reviewer_names ?? []).map((n) => n.trim().toLowerCase()));

  const now = new Date();
  const holdCutoff = new Date(now.getTime() - policy.hold_days * 86400000).toISOString();
  const expireCutoff = new Date(now.getTime() - EXPIRE_DAYS * 86400000).toISOString();

  // ---- Step 1: re-run attribution on anything still unmatched ------------
  // Uses the same shared scoring engine as reviews-import. High confidence
  // populates matched_pro_id and flips status to 'matched'; never approves.
  let rescored = 0;
  const { data: unscored } = await admin
    .from('reviews')
    .select('id, reviewer_name, comment, posted_at')
    .eq('status', 'new')
    .is('matched_pro_id', null)
    .order('posted_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (unscored && unscored.length > 0) {
    const { data: applicants } = await admin
      .from('applicants')
      .select('id, contractor_id, first_name, last_name, out_of_service_area')
      .not('contractor_id', 'is', null);
    const applicantByContractor = new Map(
      (applicants ?? []).map((a) => [a.contractor_id as string, a]),
    );

    for (const row of unscored) {
      const windowStart = new Date(
        new Date(row.posted_at as string).getTime() - CANDIDATE_WINDOW_DAYS * 86_400_000,
      ).toISOString();
      const { data: visits } = await admin
        .from('pro_visits')
        .select('id, contractor_id, customer_name, completed_at, customer_rating')
        .eq('status', 'complete')
        .not('completed_at', 'is', null)
        .gte('completed_at', windowStart)
        .lte('completed_at', row.posted_at as string);

      const candidatePool: AttributionCandidate[] = (visits ?? [])
        .map((v) => {
          const a = applicantByContractor.get(v.contractor_id as string);
          if (!a || a.out_of_service_area) return null;
          return {
            pro_id: a.id as string,
            contractor_id: v.contractor_id as string,
            pro_first_name: a.first_name as string,
            pro_last_name: a.last_name as string,
            visit_id: v.id as string,
            customer_name: v.customer_name as string | null,
            completed_at: v.completed_at as string,
            customer_rating: v.customer_rating as number | null,
          } as AttributionCandidate;
        })
        .filter((c): c is AttributionCandidate => c !== null);

      const result = attribute(
        row.reviewer_name as string | null,
        row.comment as string | null,
        row.posted_at as string,
        candidatePool,
      );

      await admin
        .from('reviews')
        .update({
          matched_job_id: result.matched_job_id,
          matched_pro_id: result.matched_pro_id,
          match_confidence: result.match_confidence,
          match_score: result.match_score,
          match_debug: result.match_debug,
          status: result.match_confidence === 'high' ? 'matched' : 'new',
        })
        .eq('id', row.id as string)
        .eq('status', 'new');
      rescored += 1;
    }
  }

  // ---- Step 2: promotion candidates -------------------------------------
  const { data: candidates, error: candErr } = await admin
    .from('reviews')
    .select('id, matched_pro_id, reviewer_name, stars, posted_at, status')
    .eq('status', 'matched')
    .eq('stars', 5)
    .not('matched_pro_id', 'is', null)
    .lte('posted_at', holdCutoff)
    .order('posted_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (candErr) {
    return jsonResponse({ ok: false, error: candErr.message }, 500);
  }

  const eligible = (candidates ?? []).filter((r) => {
    const name = (r.reviewer_name ?? '').trim().toLowerCase();
    return name.length > 0 && !excluded.has(name);
  });

  // Current-month promoted counts per pro, to enforce cap_per_month.
  const period = currentPeriod(now);
  const monthStart = `${period}-01T00:00:00.000Z`;
  const proIds = [...new Set(eligible.map((r) => r.matched_pro_id as string))];
  const monthCounts = new Map<string, number>();
  if (proIds.length > 0) {
    const { data: monthRows } = await admin
      .from('reviews')
      .select('matched_pro_id')
      .in('matched_pro_id', proIds)
      .in('status', ['awaiting_approval', 'approved', 'paid'])
      .gte('posted_at', monthStart);
    for (const row of monthRows ?? []) {
      const id = row.matched_pro_id as string;
      monthCounts.set(id, (monthCounts.get(id) ?? 0) + 1);
    }
  }

  let promoted = 0;
  const promotedIds: string[] = [];
  for (const r of eligible) {
    const proId = r.matched_pro_id as string;
    const count = monthCounts.get(proId) ?? 0;
    if (count >= policy.cap_per_month) continue;
    const { error: upErr } = await admin
      .from('reviews')
      .update({ status: 'awaiting_approval' })
      .eq('id', r.id)
      .eq('status', 'matched'); // idempotency guard — no-op if already moved
    if (!upErr) {
      promoted++;
      promotedIds.push(r.id as string);
      monthCounts.set(proId, count + 1);
    }
  }

  // ---- Step 3: expiry sweep ----------------------------------------------
  const { data: expiredRows, error: expErr } = await admin
    .from('reviews')
    .update({ status: 'expired' })
    .in('status', ['new', 'matched'])
    .lte('posted_at', expireCutoff)
    .select('id')
    .limit(BATCH_SIZE);
  if (expErr) console.error('[reviews-weekly-digest] expiry sweep failed', expErr.message);
  const expiredCount = expiredRows?.length ?? 0;

  // ---- Step 4: admin digest -----------------------------------------------
  const { count: awaitingCount } = await admin
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'awaiting_approval');

  let emailSent = false;
  if (promoted > 0 || expiredCount > 0) {
    const admins = await getAdminEmails(admin);
    if (admins.length > 0) {
      const html = `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="color:#0f172a;">📋 Weekly Review Bonus Digest</h2>
          <p style="color:#334155;font-size:14px;">
            <strong>${promoted}</strong> review${promoted === 1 ? '' : 's'} moved to <em>Awaiting Approval</em> this week.<br/>
            <strong>${expiredCount}</strong> stale review${expiredCount === 1 ? '' : 's'} expired (30+ days untouched).<br/>
            <strong>${awaitingCount ?? 0}</strong> total awaiting approval right now.
          </p>
          <a href="${ADMIN_BASE_URL}/admin/reviews" style="display:inline-block;margin-top:12px;background:#f5c518;color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Open /admin/reviews →</a>
        </div>`;
      const res = await sendBrevoEmail({
        to: admins,
        subject: `📋 Tidy Review Bonus Digest — ${promoted} to approve`,
        htmlContent: html,
        marketing: false,
        sender: { name: 'Tidy Operating System', email: ALERT_FROM_EMAIL },
        label: 'reviews-weekly-digest',
      });
      emailSent = res.sent;
    }
  }

  await admin.from('integration_logs').insert({
    source: 'internal',
    event: 'reviews_weekly_digest',
    status: 'success',
    payload_hash: `promoted=${promoted} expired=${expiredCount} awaiting=${awaitingCount ?? 0} attribution_gap=true`,
  });

  return jsonResponse({
    ok: true,
    promoted,
    promoted_ids: promotedIds,
    expired: expiredCount,
    awaiting_total: awaitingCount ?? 0,
    email_sent: emailSent,
    attribution_gap: 'shared attribution module not present yet — matching not re-run by this job',
  });
});
