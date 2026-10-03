// Tidy — 48-hour guarantee: "Something wasn't right".
//
// One tap from the member's visit record (signed in) or the post-visit email
// (?t=<rate_token>). One optional sentence. Creates a Redo task for the admin
// with the member, the Pro, the visit and the note; the admin must schedule
// the free return visit within 48 hours of the request.
//
// GET ?t=<token> → minimal visit summary for the /redo page (no PII beyond first name).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { bearerToken } from '../_shared/admin-auth.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { tidyEmailShell, TIDY_OWNER_EMAIL, TIDY_SITE } from '../_shared/email-brand.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const WINDOW_MS = 48 * 3_600_000;

const Body = z.object({
  token: z.string().trim().min(16).max(64).optional(),
  visit_id: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
  source: z.enum(['dashboard', 'email']).optional(),
  message_id: z.string().uuid().optional(),
  is_test: z.boolean().optional(),
});

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

async function resolveVisit(token?: string, visitId?: string, uid?: string | null) {
  const q = admin.from('visits').select('id, user_id, assigned_pro_id, service_type, scheduled_start, visit_date, completed_at, status, customer_first_name, is_redo, rate_token');
  if (token) {
    const { data } = await q.eq('rate_token', token).maybeSingle();
    return data && data.rate_token === token ? data : null;
  }
  if (visitId && uid) {
    const { data } = await q.eq('id', visitId).maybeSingle();
    return data && data.user_id === uid ? data : null;
  }
  return null;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  try {
    const url = new URL(req.url);
    let uid: string | null = null;
    const bt = bearerToken(req);
    if (bt) { const { data } = await admin.auth.getUser(bt); uid = data?.user?.id ?? null; }

    if (req.method === 'GET') {
      const t = url.searchParams.get('t') ?? undefined;
      if (!t) return jsonResponse({ ok: true, function: 'redo-request' });
      const v = await resolveVisit(t);
      if (!v) return jsonResponse({ ok: false, error: 'not_found' }, 404);
      const { data: existing } = await admin.from('redo_requests').select('id, status, requested_at').eq('visit_id', v.id).neq('status', 'canceled').maybeSingle();
      const open = !!v.completed_at && Date.now() - new Date(v.completed_at).getTime() <= WINDOW_MS;
      return jsonResponse({ ok: true, first_name: v.customer_first_name, service: v.service_type, completed_at: v.completed_at, window_open: open, existing });
    }
    if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body' }, 400);
    const { token, visit_id, source, is_test, message_id } = parsed.data;
    let note = parsed.data.note;
    let v: Awaited<ReturnType<typeof resolveVisit>> = null;
    let requestedAt = new Date();
    let fromInbox = false;
    if (message_id) {
      // Admin, from the support inbox: the member's message is the note and the
      // 48-hour clock starts when the member sent it, not when the admin tapped.
      if (!uid) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      const { data: isAdmin } = await admin.rpc('has_role', { _user_id: uid, _role: 'admin' });
      if (!isAdmin) return jsonResponse({ ok: false, error: 'forbidden' }, 403);
      const { data: rows } = await admin.rpc('inbox_message_visit', { _message_id: message_id });
      const m = Array.isArray(rows) ? rows[0] : rows;
      if (!m) return jsonResponse({ ok: false, error: 'message_not_found' }, 404);
      if (!m.visit_id) return jsonResponse({ ok: false, error: 'no_visit_found' }, 404);
      const { data } = await admin.from('visits').select('id, user_id, assigned_pro_id, service_type, scheduled_start, visit_date, completed_at, status, customer_first_name, is_redo, rate_token').eq('id', m.visit_id).maybeSingle();
      v = data;
      note = (m.body ?? '').slice(0, 500);
      requestedAt = new Date(m.sent_at);
      fromInbox = true;
    } else {
      v = await resolveVisit(token, visit_id, uid);
    }
    if (!v) return jsonResponse({ ok: false, error: 'not_found' }, 404);
    if (v.is_redo) return jsonResponse({ ok: false, error: 'redo_of_redo' }, 400);
    if (!v.completed_at) return jsonResponse({ ok: false, error: 'not_completed' }, 400);
    if (!fromInbox && Date.now() - new Date(v.completed_at).getTime() > WINDOW_MS) return jsonResponse({ ok: false, error: 'window_closed' }, 400);

    const { data: existing } = await admin.from('redo_requests').select('id, due_at').eq('visit_id', v.id).neq('status', 'canceled').maybeSingle();
    if (existing) return jsonResponse({ ok: true, already: true, redo_id: existing.id, due_at: existing.due_at });

    const { data: applicant } = v.assigned_pro_id
      ? await admin.from('applicants').select('id, first_name, last_name').eq('contractor_id', v.assigned_pro_id).maybeSingle()
      : { data: null };

    const now = requestedAt;
    const due = new Date(now.getTime() + WINDOW_MS);
    const { data: redo, error } = await admin.from('redo_requests').insert({
      visit_id: v.id, user_id: v.user_id, pro_id: v.assigned_pro_id, applicant_id: applicant?.id ?? null,
      note: note || null, source: fromInbox ? 'inbox' : (source ?? (token ? 'email' : 'dashboard')), support_message_id: message_id ?? null,
      requested_at: now.toISOString(), due_at: due.toISOString(), is_test_row: !!is_test,
    }).select('id').single();
    if (error) {
      if ((error as { code?: string }).code === '23505') return jsonResponse({ ok: true, already: true });
      console.error('[redo-request] insert failed', error.message);
      return jsonResponse({ ok: false, error: 'insert_failed' }, 500);
    }

    const proName = applicant ? `${applicant.first_name} ${applicant.last_name?.[0] ?? ''}.` : 'unassigned Pro';
    await admin.from('admin_workday_events').insert({
      event_type: 'redo_requested', applicant_id: applicant?.id ?? null, actor_type: 'customer',
      title: `Redo requested · ${v.customer_first_name ?? 'Member'} · ${proName}`,
      detail: note || 'No note left.', status: 'open', waiting_on_admin: true,
      action_label: 'Schedule redo', action_url: '/admin/command#redos',
      metadata: { redo_id: redo.id, visit_id: v.id, due_at: due.toISOString() },
    });

    // More than two redos in 60 days against one Pro → admin alert.
    if (applicant?.id) {
      const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
      const { count } = await admin.from('redo_requests').select('id', { count: 'exact', head: true })
        .eq('applicant_id', applicant.id).neq('status', 'canceled').gte('requested_at', since);
      if ((count ?? 0) > 2) {
        await writeAlert(admin, {
          level: 'warning', category: 'hiring',
          title: `${proName} has ${count} redos in 60 days`,
          body: 'More than two redos in 60 days. This holds their Pro Partner raise until it drops back to two or fewer.',
          action_label: 'Open Pro', action_url: `/admin/applicants?id=${applicant.id}`,
          dedupe_key: `redo_pattern:${applicant.id}`, context: { count, applicant_id: applicant.id },
        });
      }
    }

    await sendBrevoEmail({
      to: TIDY_OWNER_EMAIL, marketing: false,
      subject: `Redo requested — schedule by ${due.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })}`,
      htmlContent: tidyEmailShell({
        heading: 'A member asked for a redo', eyebrow: '48-hour guarantee',
        bodyHtml: `<p><b>Member:</b> ${esc(v.customer_first_name ?? 'Member')}<br><b>Pro:</b> ${esc(proName)}<br><b>Visit:</b> ${esc(v.service_type ?? '')} · ${esc(v.visit_date ?? '')}</p><p><b>Note:</b> ${note ? esc(note) : '(none)'}</p><p>Schedule the free return visit within 48 hours.</p>`,
        ctaUrl: `${TIDY_SITE}/admin/command#redos`, ctaLabel: 'Open Workday', artTopic: 'visit',
      }),
      tags: ['redo'], label: 'redo-request',
    }).catch(() => null);

    return jsonResponse({ ok: true, redo_id: redo.id, due_at: due.toISOString() });
  } catch (e) {
    console.error('[redo-request] failed', (e as Error).message);
    return jsonResponse({ ok: false, error: 'unexpected_error' }, 500);
  }
});
