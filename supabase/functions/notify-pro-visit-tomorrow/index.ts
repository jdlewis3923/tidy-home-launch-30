import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — producer: "you have work tomorrow".
//
// Runs at 18:00 ET, the evening before. One
// notification per PRO per day (not per visit), claimed in the database so a
// re-run produces zero duplicates. Pros with nothing tomorrow are skipped.
//
// visit_tomorrow requires SMS plus an app record, regardless of push support.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { notifyPro } from '../_shared/pro-notify.ts';
import { addDays, digestText, etDate, etDayRange, type DigestVisit } from '../_shared/pro-day-digest.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (!(await isCronAuthorized(req))) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonResponse({ok:false,error:'not_configured'},503);
  const hour = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(new Date());
  if (hour !== '18') return jsonResponse({ok:true,skipped:'not_6pm_miami'});

  console.log('[notify-pro-visit-tomorrow] entry');
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const day = typeof body.day === 'string' ? body.day : addDays(etDate(new Date()), 1);

  const { data: visits, error } = await admin
    .from('visits')
    .select(
      // Entry codes/access notes are visit-day only (Member Guide promise); never in the night-before text.
      'id, assigned_pro_id, backup_pro_id, cleaning_team_id, scheduled_start, scheduled_end, service_type, zip, is_sample',
    )
    .not('assigned_pro_id', 'is', null)
    .in('status', ['scheduled', 'on_the_way', 'in_progress'])
    .gte('scheduled_start', etDayRange(day).start)
    .lt('scheduled_start', etDayRange(day).end)
    .order('scheduled_start', { ascending: true });
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  const byPro = new Map<string, DigestVisit[]>();
  const { data: teams } = await admin.from('cleaning_teams').select('id,partner_pro_id').eq('kind','paired_pros').eq('active',true);
  const partners = new Map((teams ?? []).map(t=>[t.id,t.partner_pro_id]));
  for (const v of visits ?? []) {
    if (v.is_sample) continue;
    for (const pro of new Set([v.assigned_pro_id,v.backup_pro_id ?? partners.get(v.cleaning_team_id ?? '')])) {
      if (!pro) continue;
      const list = byPro.get(pro) ?? [];
      list.push(v as unknown as DigestVisit);
      byPro.set(pro,list);
    }
  }

  const results: Record<string, unknown>[] = [];
  for (const [contractorId, list] of byPro) {
    const {data:candidate} = await admin.from('applicants').select('id,is_test_row').eq('contractor_id',contractorId).maybeSingle();
    const {data:pipeline,error:pipelineError} = candidate ? await admin.from('contractor_pipeline').select('is_test,archived').eq('applicant_id',candidate.id).maybeSingle() : {data:null,error:null};
    if (!candidate || candidate.is_test_row || pipelineError || !pipeline || pipeline.is_test || pipeline.archived) { results.push({contractor_id:contractorId,skipped:'test_archived_or_missing_pro'}); continue; }
    const {data:language,error:languageError} = await admin.rpc('user_lang',{_uid:contractorId});
    if (languageError) {results.push({contractor_id:contractorId,skipped:'language_unavailable'});continue;}
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
    const { title, body: text } = digestText(list, 'tomorrow', language === 'es' ? 'es' : 'en');
    const r = await notifyPro(admin, {
      contractor_id: contractorId,
      kind: 'visit_tomorrow',
      title,
      body: text,
      url: '/pro/schedule',
      idempotency_key: `visit_tomorrow:${contractorId}:${day}`,
      context: { day, visit_ids: list.map((v) => v.id) },
      sms_required: true,
    });
    results.push({ contractor_id: contractorId, visits: list.length, ...r });
  }

  return jsonResponse({ ok: true, day, pros: byPro.size, results });
});
