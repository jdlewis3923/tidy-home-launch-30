// Tidy — Pull contractor payroll records from Jobber and upsert into cost_entries.
// Admin-gated. Idempotent via (source='jobber', external_id=payroll_record_id).

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { jobberGraphQL } from '../_shared/jobber-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  start_date: z.string(), // YYYY-MM-DD
  end_date: z.string(),
});

// Jobber payrollRecords gives finalCost per user per visit/timesheet.
const PAYROLL_QUERY = `
  query Payroll($after: String, $start: ISO8601DateTime!, $end: ISO8601DateTime!) {
    payrollRecords(first: 100, after: $after, filter: { startAt: { after: $start, before: $end } }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        startAt
        endAt
        finalDuration
        finalCost
        labourRate
        user { id name { full } }
        visit { id title job { id jobNumber } }
      }
    }
  }
`;

async function isAdmin(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;
  const { data } = await supabase.auth.getUser(token);
  if (!data?.user) return false;
  const { data: roleRow } = await supabase
    .from('user_roles').select('role').eq('user_id', data.user.id).eq('role', 'admin').maybeSingle();
  return Boolean(roleRow);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!(await isAdmin(req, supabase))) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid JSON' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonResponse({ ok: false, error: parsed.error.flatten() }, 400);

  const startISO = `${parsed.data.start_date}T00:00:00Z`;
  const endISO = `${parsed.data.end_date}T23:59:59Z`;

  let after: string | null = null;
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    do {
      const data = await jobberGraphQL<{
        payrollRecords: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            startAt: string;
            endAt: string;
            finalDuration: number | null;
            finalCost: number | null;
            labourRate: number | null;
            user: { id: string; name: { full: string } } | null;
            visit: { id: string; title: string | null; job: { id: string; jobNumber: number } | null } | null;
          }>;
        };
      }>(PAYROLL_QUERY, { after, start: startISO, end: endISO });

      for (const node of data.payrollRecords.nodes) {
        if (node.finalCost == null || node.finalCost <= 0) { skipped++; continue; }
        const amount_cents = Math.round(Number(node.finalCost) * 100);
        const spent_on = node.startAt.slice(0, 10);
        const description = node.visit?.title
          ? `${node.visit.title}${node.visit.job?.jobNumber ? ` (Job #${node.visit.job.jobNumber})` : ''}`
          : 'Jobber payroll record';

        const { error } = await supabase.from('cost_entries').upsert({
          category: 'contractor',
          subcategory: 'payroll',
          vendor: node.user?.name?.full ?? 'Unknown contractor',
          contractor_name: node.user?.name?.full ?? null,
          description,
          amount_cents,
          spent_on,
          jobber_job_id: node.visit?.job?.id ?? null,
          jobber_visit_id: node.visit?.id ?? null,
          source: 'jobber',
          external_id: node.id,
          notes: node.finalDuration ? `${(node.finalDuration / 3600).toFixed(2)}h @ $${node.labourRate ?? '?'}/h` : null,
        }, { onConflict: 'source,external_id' });

        if (error) { errors.push(`${node.id}: ${error.message}`); continue; }
        synced++;
      }
      after = data.payrollRecords.pageInfo.hasNextPage ? data.payrollRecords.pageInfo.endCursor : null;
    } while (after);

    return jsonResponse({ ok: true, synced, skipped, errors: errors.slice(0, 10), error_count: errors.length });
  } catch (err) {
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : String(err), synced, skipped }, 500);
  }
});
