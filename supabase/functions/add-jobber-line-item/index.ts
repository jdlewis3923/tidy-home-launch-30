// Tidy — Add a line item to a Jobber job via the visit ID.
//
// Strategy: Jobber visits belong to a job. We look up the visit's job ID,
// then call jobLineItemCreate to attach the add-on as a billable line item.
// Contractor sees this on the visit's job page in the Jobber app.
//
// Service-role only.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { jobberGraphQL } from '../_shared/jobber-client.ts';

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  jobber_visit_id: z.string(),
  addon_name: z.string(),
  addon_price: z.number(),
  addon_description: z.string().optional(),
  quantity: z.number().int().positive().default(1),
});

const VISIT_QUERY = `
  query VisitJob($id: EncodedId!) {
    visit(id: $id) {
      id
      job { id }
    }
  }
`;

const LINE_ITEM_MUTATION = `
  mutation AddLineItem($jobId: EncodedId!, $input: JobLineItemCreateInput!) {
    jobLineItemCreate(jobId: $jobId, input: $input) {
      lineItem { id name unitCost quantity }
      userErrors { message path }
    }
  }
`;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { jobber_visit_id, addon_name, addon_price, addon_description, quantity } = parsed.data;

  try {
    // 1. Resolve visit → job ID
    const visitResp = await jobberGraphQL<{ visit: { id: string; job: { id: string } | null } | null }>(
      VISIT_QUERY,
      { id: jobber_visit_id },
    );
    const jobId = visitResp.visit?.job?.id;
    if (!jobId) {
      return jsonResponse({ ok: false, error: 'visit_not_found_or_no_job', jobber_visit_id }, 404);
    }

    // 2. Create the line item on the parent job
    const mutResp = await jobberGraphQL<{
      jobLineItemCreate: {
        lineItem: { id: string; name: string; unitCost: number; quantity: number } | null;
        userErrors: Array<{ message: string; path: string[] }>;
      };
    }>(LINE_ITEM_MUTATION, {
      jobId,
      input: {
        name: addon_name,
        description: addon_description ?? `Add-on attached via Tidy: ${addon_name}`,
        quantity,
        unitCost: addon_price,
        taxable: true,
      },
    });

    const errs = mutResp.jobLineItemCreate.userErrors ?? [];
    if (errs.length > 0) {
      return jsonResponse({ ok: false, error: 'jobber_user_error', user_errors: errs }, 422);
    }

    return jsonResponse({
      ok: true,
      jobber_job_id: jobId,
      jobber_line_item_id: mutResp.jobLineItemCreate.lineItem?.id,
      addon_name,
      addon_price,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[add-jobber-line-item] failed', message);
    return jsonResponse({ ok: false, error: 'jobber_call_failed', detail: message }, 500);
  }
});
