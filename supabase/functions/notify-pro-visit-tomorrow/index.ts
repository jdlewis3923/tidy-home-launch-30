// Tidy — producer: "you have work tomorrow".
//
// Runs at 17:00 ET, the evening before, inside the courtesy window. One
// notification per PRO per day (not per visit), claimed in the database so a
// re-run produces zero duplicates. Pros with nothing tomorrow are skipped.
//
// visit_tomorrow is time-critical: push first, SMS fallback, window ignored.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { notifyPro } from '../_shared/pro-notify.ts';
import { addDays, digestText, etDate, etDayRange, type DigestVisit } from '../_shared/pro-day-digest.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (!(await isCronAuthorized(req))) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  console.log('[notify-pro-visit-tomorrow] entry');
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const day = typeof body.day === 'string' ? body.day : addDays(etDate(new Date()), 1);

  const { data: visits, error } = await admin
    .from('visits')
    .select(
      'id, assigned_pro_id, scheduled_start, service_type, street, zip, access_notes, gate_code, parking_notes, pet_notes',
    )
    .not('assigned_pro_id', 'is', null)
    .in('status', ['scheduled', 'on_the_way', 'in_progress'])
    .gte('scheduled_start', etDayRange(day).start)
    .lt('scheduled_start', etDayRange(day).end)
    .order('scheduled_start', { ascending: true });
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  const byPro = new Map<string, DigestVisit[]>();
  for (const v of visits ?? []) {
    const pro = (v as { assigned_pro_id: string }).assigned_pro_id;
    if (!byPro.has(pro)) byPro.set(pro, []);
    byPro.get(pro)!.push(v as unknown as DigestVisit);
  }

  const results: Record<string, unknown>[] = [];
  for (const [contractorId, list] of byPro) {
    const { data: claimed, error: claimErr } = await admin.rpc('claim_pro_notification', {
      _contractor_id: contractorId,
      _kind: 'visit_tomorrow',
      _scope: day,
    });
    if (claimErr) {
      console.error('[notify-pro-visit-tomorrow] claim failed', claimErr.message);
      results.push({ contractor_id: contractorId, skipped: 'claim_error' });
      continue;
    }
    if (claimed !== true) {
      results.push({ contractor_id: contractorId, skipped: 'already_sent' });
      continue;
    }
    const { title, body: text } = digestText(list, 'tomorrow');
    const r = await notifyPro(admin, {
      contractor_id: contractorId,
      kind: 'visit_tomorrow',
      title,
      body: text,
      url: '/pro/schedule',
      idempotency_key: `visit_tomorrow:${contractorId}:${day}`,
      context: { day, visit_ids: list.map((v) => v.id) },
    });
    results.push({ contractor_id: contractorId, visits: list.length, ...r });
  }

  return jsonResponse({ ok: true, day, pros: byPro.size, results });
});
