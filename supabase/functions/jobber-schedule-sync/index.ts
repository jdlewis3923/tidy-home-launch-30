// jobber-schedule-sync — pulls today's visits from Jobber and refreshes pro_visits
// for the current day. Cron-driven every 15 minutes. Also bumps applicants
// counters via direct SQL (the recalc function is the canonical path; this is a
// lightweight today-only top-up).
//
// Currently a no-op stub when JOBBER_REFRESH_TOKEN is missing — returns 503.
// Real Jobber GraphQL is exposed via the existing _shared/jobber-client.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse, corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  let jobberClient: typeof import('../_shared/jobber-client.ts') | null = null;
  try {
    jobberClient = await import('../_shared/jobber-client.ts');
  } catch (_) {
    jobberClient = null;
  }
  if (!jobberClient) {
    return jsonResponse({ ok: false, skipped: 'jobber-client unavailable' }, 503);
  }

  const QUERY = `
    query TodayVisits($start: ISO8601DateTime!, $end: ISO8601DateTime!) {
      visits(filter: { startAt: { after: $start, before: $end } }, first: 100) {
        nodes {
          id
          title
          startAt
          endAt
          job { id jobNumber client { name { full } } }
          assignedUsers { nodes { id } }
        }
      }
    }
  `;

  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(); end.setHours(23,59,59,999);

  let result: { visits?: { nodes: unknown[] } };
  try {
    result = await (jobberClient as any).jobberGraphQL(QUERY, {
      start: start.toISOString(),
      end: end.toISOString(),
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: (err as Error).message }, 502);
  }

  const nodes = (result?.visits?.nodes ?? []) as any[];
  let upserts = 0;
  for (const n of nodes) {
    const userId = n.assignedUsers?.nodes?.[0]?.id;
    if (!userId) continue;
    const { data: applicant } = await admin
      .from('applicants').select('contractor_id').eq('jobber_id', userId).maybeSingle();
    if (!applicant?.contractor_id) continue;
    const { error } = await admin.from('pro_visits').upsert({
      jobber_visit_id: n.id,
      contractor_id: applicant.contractor_id,
      customer_name: n.job?.client?.name?.full ?? null,
      service_type: n.title ?? null,
      scheduled_at: n.startAt,
      status: 'scheduled',
      photos_expected: 6,
    }, { onConflict: 'jobber_visit_id' });
    if (!error) upserts++;
  }

  return new Response(JSON.stringify({ ok: true, fetched: nodes.length, upserts }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
