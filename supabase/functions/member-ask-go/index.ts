// Tidy — one-tap links in review / referral ask texts (jointidy.co/go/<id>).
// Records that the member acted (so the visit-5 review re-ask is skipped) and
// returns where to send them.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const GOOGLE_REVIEW_URL = 'https://g.page/r/Cd7-Iz6HobqzEBI/review';
const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const id = typeof body?.id === 'string' ? body.id : new URL(req.url).searchParams.get('id') ?? '';
  if (!UUID.test(id)) return jsonResponse({ ok: false, error: 'invalid_id' }, 400);
  const { data: ask } = await admin.from('member_asks').select('id, user_id, kind, acted_at').eq('id', id).maybeSingle();
  if (!ask) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (!ask.acted_at) await admin.from('member_asks').update({ acted_at: new Date().toISOString() }).eq('id', id);
  if (ask.kind === 'review') return jsonResponse({ ok: true, kind: 'review', url: GOOGLE_REVIEW_URL });
  const { data: p } = await admin.from('profiles').select('first_name, referral_code').eq('user_id', ask.user_id).maybeSingle();
  const share = p?.referral_code ? `https://jointidy.co/referral?promo=${encodeURIComponent(p.referral_code)}` : 'https://jointidy.co/refer';
  return jsonResponse({ ok: true, kind: 'referral', share_url: share, first_name: p?.first_name ?? null });
});
