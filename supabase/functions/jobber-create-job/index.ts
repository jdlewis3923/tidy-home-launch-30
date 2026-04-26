// Tidy — Jobber recurring job creation.
//
// Service-role only. Given a subscription_id, creates one Jobber Job per
// service in the subscription, anchored at the corresponding scheduled
// visit dates. Stores the resulting Jobber job IDs back onto
// subscriptions.jobber_job_ids (keyed by service) and onto each visit
// row (visits.jobber_job_id).
//
// Idempotent at the subscription level: if jobber_job_ids already
// contains all expected services, we short-circuit.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';
import { jobberGraphQL } from '../_shared/jobber-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  subscription_id: z.string().uuid(),
});

// Minimal jobCreate mutation — pulled from Jobber 2024-04-01 schema.
// Visits are returned with the job; we map them onto our visits rows.
const JOB_CREATE = `
  mutation JobCreate($input: JobCreateInput!) {
    jobCreate(input: $input) {
      job {
        id
        title
        visits(first: 10) {
          nodes { id startAt }
        }
      }
      userErrors { message path }
    }
  }
`;

const SERVICE_TITLE: Record<string, string> = {
  cleaning: 'Tidy — Recurring House Cleaning',
  lawn: 'Tidy — Recurring Lawn Care',
  detailing: 'Tidy — Recurring Mobile Car Detailing',
};

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  return auth === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  if (!isAuthorized(req)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid JSON' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { subscription_id } = parsed.data;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await withLogging({
      source: 'jobber',
      event: 'create_job',
      payload: { subscription_id },
      fn: async () => {
        const { data: sub, error: subErr } = await supabase
          .from('subscriptions')
          .select('id, user_id, services, jobber_client_id, jobber_job_ids, frequency')
          .eq('id', subscription_id)
          .maybeSingle();
        if (subErr) throw new Error(`subscription lookup failed: ${subErr.message}`);
        if (!sub) throw new Error('subscription not found');
        if (!sub.jobber_client_id) {
          throw new Error('subscription has no jobber_client_id — run jobber-sync-customer first');
        }

        const services: string[] = sub.services ?? [];
        const existing = (sub.jobber_job_ids ?? {}) as Record<string, string>;

        // Short-circuit if every service already has a job.
        const missing = services.filter((s) => !existing[s]);
        if (missing.length === 0) {
          return { ok: true as const, reused: true as const, jobber_job_ids: existing };
        }

        const updatedMap: Record<string, string> = { ...existing };

        for (const service of missing) {
          // Find the next scheduled visit for this service to use as start.
          const { data: nextVisit } = await supabase
            .from('visits')
            .select('id, visit_date')
            .eq('subscription_id', subscription_id)
            .eq('service', service)
            .eq('status', 'scheduled')
            .order('visit_date', { ascending: true })
            .limit(1)
            .maybeSingle();

          const startAt = nextVisit?.visit_date
            ? new Date(`${nextVisit.visit_date}T13:00:00Z`).toISOString()
            : new Date(Date.now() + 5 * 86_400_000).toISOString();

          const input = {
            clientId: sub.jobber_client_id,
            title: SERVICE_TITLE[service] ?? `Tidy — ${service}`,
            startAt,
            // Note: Jobber's recurring schedule is configured separately
            // via the Jobber UI / Job Type defaults. We create the parent
            // job and let Jobber's scheduler handle recurrence.
          };

          const data = await jobberGraphQL<{
            jobCreate: {
              job: { id: string; visits: { nodes: Array<{ id: string; startAt: string }> } } | null;
              userErrors: Array<{ message: string; path: string[] }>;
            };
          }>(JOB_CREATE, { input });

          const errs = data.jobCreate.userErrors;
          if (errs && errs.length) {
            throw new Error(`jobCreate userErrors (${service}): ${errs.map((e) => e.message).join('; ')}`);
          }
          const job = data.jobCreate.job;
          if (!job?.id) throw new Error(`jobCreate returned no id for ${service}`);

          updatedMap[service] = job.id;

          // Stamp jobber_job_id onto our scheduled visits for this service.
          await supabase
            .from('visits')
            .update({ jobber_job_id: job.id })
            .eq('subscription_id', subscription_id)
            .eq('service', service)
            .eq('status', 'scheduled');
        }

        const { error: updErr } = await supabase
          .from('subscriptions')
          .update({ jobber_job_ids: updatedMap })
          .eq('id', subscription_id);
        if (updErr) throw new Error(`subscriptions update failed: ${updErr.message}`);

        return { ok: true as const, reused: false as const, jobber_job_ids: updatedMap };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[jobber-create-job] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
