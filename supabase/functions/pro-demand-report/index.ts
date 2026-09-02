// Tidy — A5. Weekly high-demand report.
//
// A Pro crossing the "high demand" line is a hiring signal, not a customer
// message: it means requests for that Pro are outrunning their calendar. This
// runs weekly, records each crossing once per period in
// public.pro_demand_crossings, and raises a single admin alert listing who
// crossed and where they work.
//
// Nothing here reaches a Pro or a customer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** ISO-ish week bucket, e.g. 2026-W12 — the dedupe key for a crossing. */
function currentPeriod(d = new Date()): string {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

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

  const { data: stats, error } = await admin.rpc('get_pro_capacity_stats');
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  const period = currentPeriod();
  const crossing = (stats ?? []).filter((s: { high_demand?: boolean }) => s.high_demand === true);
  if (crossing.length === 0) {
    return jsonResponse({ ok: true, period, crossings: 0 });
  }

  const ids = crossing.map((s: { applicant_id: string }) => s.applicant_id);
  const { data: pros } = await admin
    .from('applicants')
    .select('id, first_name, last_name, zip_code, service_zips')
    .in('id', ids);
  const byId = new Map((pros ?? []).map((p) => [p.id, p]));

  const recorded: string[] = [];
  const lines: string[] = [];
  for (const s of crossing as Array<{ applicant_id: string; preferred_by_count: number; booked_pct: number }>) {
    // UNIQUE (applicant_id, period) makes this report-once-per-week for free.
    const { data: row } = await admin
      .from('pro_demand_crossings')
      .insert({
        applicant_id: s.applicant_id,
        period,
        preferred_by_count: s.preferred_by_count ?? 0,
        booked_pct: s.booked_pct ?? null,
      })
      .select('id')
      .maybeSingle();
    if (!row) continue;
    recorded.push(s.applicant_id);
    const p = byId.get(s.applicant_id);
    const area = (p as { zip_code?: string; service_zips?: string[] } | undefined);
    const where = area?.zip_code ?? (area?.service_zips ?? []).join(', ') ?? 'unknown area';
    lines.push(
      `• ${p?.first_name ?? 'Pro'} ${p?.last_name ?? ''} — requested by ${s.preferred_by_count} ` +
      `customer(s), calendar ${s.booked_pct ?? '?'}% booked, works ${where}`,
    );
  }

  if (recorded.length === 0) {
    return jsonResponse({ ok: true, period, crossings: 0, reason: 'already_reported_this_period' });
  }

  await admin.from('admin_alerts').insert({
    alert_type: 'pro_high_demand_crossing',
    title: `Hiring signal — ${recorded.length} Pro(s) at capacity (${period})`,
    body:
      `Demand for these Pros is outrunning their calendar. Hire near where they work ` +
      `before we start telling customers no.\n\n${lines.join('\n')}`,
    context: { period, applicant_ids: recorded },
  });

  return jsonResponse({ ok: true, period, crossings: recorded.length });
});
