import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — Admin-only review bonus actions: approve / reject / reassign / bulk_approve.
// Reject / reassign only. Bonus approval lives in public.approve_review_bonus.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

interface Policy {
  amount_cents: number;
  cap_per_month: number;
  hold_days: number;
  excluded_reviewer_names: string[];
}
const DEFAULT_POLICY: Policy = { amount_cents: 2500, cap_per_month: 4, hold_days: 7, excluded_reviewer_names: ['A Google User'] };

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: roleCheck } = await admin.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' });
  if (roleCheck !== true) return jsonResponse({ ok: false, error: 'forbidden — admin role required' }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;

  const { data: settingsRow } = await admin.from('app_settings').select('value').eq('key', 'review_bonus').maybeSingle();
  const policy: Policy = { ...DEFAULT_POLICY, ...(settingsRow?.value as Partial<Policy> | undefined) };

  if (action === 'reject') {
    const reviewId = body?.review_id as string;
    if (!reviewId) return jsonResponse({ ok: false, error: 'missing review_id' }, 400);
    const { error } = await admin.from('reviews').update({ status: 'rejected', approved_by: userData.user.id, notes: body?.notes ?? null }).eq('id', reviewId);
    if (error) return jsonResponse({ ok: false, error: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  if (action === 'reassign') {
    const reviewId = body?.review_id as string;
    const proId = body?.pro_id as string | null;
    if (!reviewId) return jsonResponse({ ok: false, error: 'missing review_id' }, 400);
    const { error } = await admin.from('reviews').update({
      matched_pro_id: proId, status: proId ? 'matched' : 'new', match_confidence: 'none', match_score: null,
      match_debug: { manual_reassign_by: userData.user.id, at: new Date().toISOString() },
    }).eq('id', reviewId);
    if (error) return jsonResponse({ ok: false, error: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  // Approval moved to approve_review_bonus (Admin → Review Bonuses): one $25
  // bonus per member, no monthly cap, no hold, credited to the next Friday payout.
  if (action === 'approve' || action === 'bulk_approve') {
    return jsonResponse({ ok: false, error: 'retired — approve from the Review Bonuses form (member + Pro required)' }, 410);
  }

  return jsonResponse({ ok: false, error: 'unknown_action' }, 400);
});
