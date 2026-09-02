// Tidy — B3 timeout sweeper. A walkaround add-on request that nobody answers
// within 15 minutes expires on its own: nothing is charged and the Pro is told
// to do the booked scope only. Silence is a decline, and the Pro is never left
// standing in a driveway waiting.
//
// Invoked every minute by pg_cron. Service-role only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { notifyPro } from '../_shared/pro-notify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: expired, error } = await admin
    .from('addon_requests')
    .update({ status: 'expired', responded_at: new Date().toISOString() })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id, job_id, pro_id, addon_name, photo_url, condition_note, pro_visit_id');
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  for (const r of expired ?? []) {
    // Same rating protection as an explicit decline — the Pro did the right
    // thing and got no answer.
    if (r.pro_visit_id) {
      await admin.from('pro_visits').update({
        condition_flagged: true,
        condition_photo_url: r.photo_url,
        condition_note: r.condition_note,
        declined_addon_name: r.addon_name,
      }).eq('id', r.pro_visit_id);
    }
    await notifyPro(admin, {
      contractor_id: r.pro_id,
      kind: 'addon_expired',
      title: `No answer — skip the ${r.addon_name}`,
      body: 'Do the scope they already booked. This will not count against your rating.',
      url: `/pro/job/${r.job_id}`,
      context: { addon_request_id: r.id, job_id: r.job_id },
    });
  }

  return jsonResponse({ ok: true, expired: expired?.length ?? 0 });
});
