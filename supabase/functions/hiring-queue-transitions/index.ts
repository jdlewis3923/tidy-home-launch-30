import '../_shared/http.ts';
/**
 * hiring-queue-transitions — hourly at :20.
 *
 *   texted   >= 24h with no reply -> follow_up_due (held to Monday 9 AM if the
 *                                    due moment lands on a Sunday)
 *   followed_up >= 48h with no reply -> cold
 *
 * Nothing here contacts anyone. It only moves cards.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';

/** Is "now" a Sunday in America/New_York? */
function isEasternSunday(at: Date): boolean {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(at) === 'Sun';
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // Scheduled dispatches present the cron credential; admins call it by hand.
  const cron = await isCronAuthorized(req);
  const auth = cron ? { ok: true as const } : await requireServiceOrAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const now = new Date();
  const sunday = isEasternSunday(now);
  const cutoff24 = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const cutoff48 = new Date(now.getTime() - 48 * 3600_000).toISOString();

  let toFollowUp = 0;
  const errors: string[] = [];

  // Sunday holds the nudge until Monday 9 AM — no card becomes "due" on a Sunday.
  if (!sunday) {
    const { data, error } = await admin
      .from('applicants')
      .update({ queue_state: 'follow_up_due' })
      .eq('queue_state', 'texted')
      .is('replied_at', null)
      .lte('first_texted_at', cutoff24)
      .select('id');
    if (error) errors.push(`follow_up_due: ${error.message}`);
    toFollowUp = data?.length ?? 0;
  }

  const { data: coldRows, error: coldErr } = await admin
    .from('applicants')
    .update({ queue_state: 'cold' })
    .eq('queue_state', 'followed_up')
    .is('replied_at', null)
    .lte('followed_up_at', cutoff48)
    .select('id');
  if (coldErr) errors.push(`cold: ${coldErr.message}`);

  return new Response(
    JSON.stringify({
      ok: errors.length === 0,
      sunday_hold: sunday,
      moved_to_follow_up_due: toFollowUp,
      moved_to_cold: coldRows?.length ?? 0,
      errors,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
