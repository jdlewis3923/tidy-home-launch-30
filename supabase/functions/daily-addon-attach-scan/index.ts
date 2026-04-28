// Tidy — Daily Add-on Attach Scanner.
//
// Triggered once per day by a Zapier Schedule trigger. Scans Jobber visits
// in the [today + days_window_start, today + days_window_end] window, looks
// up matching customers via subscriptions.jobber_client_id, and POSTs to
// send-addon-attach-sms per visit. All suppression / variant logic stays
// inside send-addon-attach-sms — this is a pure fan-out.
//
// Auth: service-role bearer OR X-Zap-Webhook-Secret header.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { jobberGraphQL } from '../_shared/jobber-client.ts';
import { isServiceOrZapAuthorized } from '../_shared/zap-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  days_window_start: z.number().int().min(0).max(60).default(5),
  days_window_end:   z.number().int().min(0).max(60).default(7),
}).refine((v) => v.days_window_end >= v.days_window_start, {
  message: 'days_window_end must be >= days_window_start',
});

const VISITS_QUERY = `
  query VisitsInWindow($startAt: ISO8601DateTime!, $endAt: ISO8601DateTime!, $first: Int!, $after: String) {
    visits(filter: { startAt: { after: $startAt, before: $endAt } }, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        startAt
        client { id }
        job { id title }
      }
    }
  }
`;

interface JobberVisit {
  id: string;
  startAt: string;
  client: { id: string } | null;
  job: { id: string; title: string | null } | null;
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayPlusEndOfDay(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

function inferService(jobTitle: string | null | undefined): 'cleaning' | 'lawn' | 'detailing' | undefined {
  const t = (jobTitle ?? '').toLowerCase();
  if (t.includes('clean')) return 'cleaning';
  if (t.includes('lawn') || t.includes('yard') || t.includes('mow')) return 'lawn';
  if (t.includes('detail') || t.includes('car') || t.includes('vehicle')) return 'detailing';
  return undefined;
}

function formatVisitDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);

  if (!isServiceOrZapAuthorized(req)) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text.length ? JSON.parse(text) : {};
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { days_window_start, days_window_end } = parsed.data;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startAt = todayPlus(days_window_start);
  const endAt = todayPlusEndOfDay(days_window_end);

  // 1. Page through Jobber visits in window
  const visits: JobberVisit[] = [];
  let cursor: string | null = null;
  let pageGuard = 0;
  try {
    do {
      const data = await jobberGraphQL<{
        visits: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: JobberVisit[];
        };
      }>(VISITS_QUERY, { startAt, endAt, first: 50, after: cursor });
      visits.push(...data.visits.nodes);
      cursor = data.visits.pageInfo.hasNextPage ? data.visits.pageInfo.endCursor : null;
      pageGuard++;
    } while (cursor && pageGuard < 20);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[daily-addon-attach-scan] jobber fetch failed', message);
    return jsonResponse({ ok: false, error: 'jobber_fetch_failed', detail: message }, 502);
  }

  let scanned = 0;
  let sent = 0;
  let suppressed = 0;
  let errors = 0;
  const errorDetails: Array<{ jobber_visit_id: string; reason: string }> = [];

  for (const visit of visits) {
    scanned++;
    const jobberClientId = visit.client?.id;
    if (!jobberClientId) {
      errors++;
      errorDetails.push({ jobber_visit_id: visit.id, reason: 'no_client_on_visit' });
      continue;
    }

    // 2. Resolve Jobber client → user_id via subscriptions
    const { data: sub } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('jobber_client_id', jobberClientId)
      .maybeSingle();
    const userId = sub?.user_id;

    if (!userId) {
      errors++;
      errorDetails.push({ jobber_visit_id: visit.id, reason: 'no_local_user_for_client' });
      // Log the gap so admin can see ungathered Jobber-only customers
      await admin.from('addon_sms_log').insert({
        user_id: null,
        jobber_visit_id: visit.id,
        suppressed_at: new Date().toISOString(),
        suppression_reason: 'no_local_user_for_client',
        context: { jobber_client_id: jobberClientId, job_title: visit.job?.title ?? null },
      });
      continue;
    }

    // 3. Fan out to send-addon-attach-sms
    const payload = {
      user_id: userId,
      jobber_visit_id: visit.id,
      visit_date: formatVisitDate(visit.startAt),
      service: inferService(visit.job?.title),
    };

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-addon-attach-sms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        errors++;
        errorDetails.push({ jobber_visit_id: visit.id, reason: json.error ?? `http_${resp.status}` });
      } else if (json.sent) {
        sent++;
      } else {
        suppressed++;
      }
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : 'unknown';
      errorDetails.push({ jobber_visit_id: visit.id, reason: message });
    }
  }

  return jsonResponse({
    ok: true,
    window: { days_window_start, days_window_end, startAt, endAt },
    scanned,
    sent,
    suppressed,
    errors,
    error_details: errorDetails.slice(0, 25),
  });
});
