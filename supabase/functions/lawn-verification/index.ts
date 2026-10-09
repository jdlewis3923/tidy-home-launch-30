// Lawn size verification.
//   verify  (admin)  — record turf-only measured sq ft, derive the band, notify.
//   load    (public) — the confirmation page reads a size-up offer by token.
//   respond (public) — the customer confirms (goes live at the new size) or declines (cancelled).
// The band derivation and every price live in the database (admin_lawn_verify,
// lawn_line_cents) so a founding home is always priced from its own rate card.
// WRITE FIRST: the notice row is saved before any email; a failed send raises an
// admin alert and never undoes the verification.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { tidyEmailShell } from '../_shared/email-brand.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SITE = 'https://jointidy.co';
const NAMES: Record<string, { en: string; es: string }> = {
  '1': { en: 'Small', es: 'Pequeño' }, '2': { en: 'Standard', es: 'Estándar' }, '3': { en: 'Large', es: 'Grande' },
};
const money = (c: number | null | undefined) => (c == null ? '' : `$${Math.round(c / 100).toLocaleString('en-US')}`);
const sq = (n: number) => n.toLocaleString('en-US');

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('verify'), reservation_id: z.string().uuid(), measured_sqft: z.number().int().min(1).max(200000) }),
  z.object({ action: z.literal('load'), token: z.string().min(20).max(80) }),
  z.object({ action: z.literal('respond'), token: z.string().min(20).max(80), accept: z.boolean() }),
]);

// deno-lint-ignore no-explicit-any
export function noticeFor(kind: string, r: any, v: any): { subject: string; text: string; cta?: string } | null {
  const es = r.lang === 'es';
  const size = NAMES[v.verified_size]?.[es ? 'es' : 'en'] ?? '';
  const area = sq(v.measured_sqft);
  if (kind === 'size_up') {
    const text = es
      ? `Medimos tu césped desde arriba en unos ${area} pies², lo que lo coloca en nuestro tamaño ${size}. Tu plan es ${money(v.new_cents)} al mes${v.old_cents != null ? ` en lugar de ${money(v.old_cents)}` : ''}. No se cobra nada hasta que lo confirmes.`
      : `We measured your lawn from above at about ${area} sq ft, which puts it in our ${size} size. Your plan is ${money(v.new_cents)} a month${v.old_cents != null ? ` instead of ${money(v.old_cents)}` : ''}. Nothing is charged until you confirm.`;
    return { subject: es ? 'Confirma el tamaño de tu césped' : 'Please confirm your lawn size', text, cta: `${SITE}/lawn-size/${v.token}` };
  }
  if (kind === 'size_down') {
    const text = es
      ? `Medimos tu césped desde arriba en unos ${area} pies², lo que lo coloca en nuestro tamaño ${size}. Bajamos tu plan a ${money(v.new_cents)} al mes (antes ${money(v.old_cents)}). No tienes que hacer nada.`
      : `We measured your lawn from above at about ${area} sq ft, which puts it in our ${size} size. We've moved your plan down to ${money(v.new_cents)} a month (was ${money(v.old_cents)}). Nothing for you to do.`;
    return { subject: es ? 'Tu plan de césped bajó de precio' : 'Your lawn plan just got lower', text };
  }
  if (kind === 'quote') {
    const text = es
      ? `Medimos tu césped desde arriba en unos ${area} pies², más de 12,000 pies². Lo cotizamos a mano y te llamamos antes de cualquier visita. No se cobra nada.`
      : `We measured your lawn from above at about ${area} sq ft — larger than 12,000 sq ft. We'll quote it by hand and call you before any visit. Nothing is charged.`;
    return { subject: es ? 'Cotizaremos tu césped' : "We'll quote your lawn by hand", text };
  }
  return null;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body' }, 400);
  const b = parsed.data;

  if (b.action === 'verify') {
    const auth = req.headers.get('Authorization') ?? '';
    // The RPC runs as the caller, so has_role(auth.uid(), 'admin') is the gate.
    const asCaller = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: v, error } = await asCaller.rpc('admin_lawn_verify', { _reservation: b.reservation_id, _measured: b.measured_sqft });
    if (error) return jsonResponse({ ok: false, error: error.message }, error.code === '42501' ? 403 : 400);
    const { data: r } = await admin.from('reservations').select('id, email, first_name, lang').eq('id', b.reservation_id).single();
    const n = noticeFor(v.kind, r, v);
    let email_status = 'skipped';
    if (n && r) {
      const { data: row } = await admin.from('lawn_size_notices').insert({ reservation_id: r.id, kind: v.kind, email: r.email, subject: n.subject, body: n.text }).select('id').single();
      try {
        const sent = await sendBrevoEmail({ to: { email: r.email, name: r.first_name }, marketing: false, subject: n.subject, label: 'lawn-size-notice',
          htmlContent: tidyEmailShell({ heading: n.subject, eyebrow: 'Lawn Care', bodyHtml: `<p>${r.first_name},</p><p>${n.text}</p>`, ctaUrl: n.cta, ctaLabel: n.cta ? (r.lang === 'es' ? 'Revisar y confirmar' : 'Review and confirm') : undefined }) });
        email_status = sent.sent ? 'sent' : 'failed';
        await admin.from('lawn_size_notices').update({ email_status, email_error: sent.sent ? null : (sent.reason ?? 'send failed'), sent_at: sent.sent ? new Date().toISOString() : null }).eq('id', row?.id);
        if (!sent.sent) throw new Error(sent.reason ?? 'send failed');
      } catch (e) {
        email_status = 'failed';
        await writeAlert(admin, { level: 'warning', category: 'reservations', title: 'Lawn size notice did not send', body: `${r.first_name}'s lawn was verified, but the email did not send: ${e instanceof Error ? e.message : String(e)}. Tell them before the first visit.`, action_label: 'Open lawn verification', action_url: '/admin/lawn-verification', dedupe_key: `lawn_notice:${r.id}:${v.kind}`, context: { reservation_id: r.id } });
      }
    }
    return jsonResponse({ ok: true, result: { ...v, token: undefined }, email_status });
  }

  const limited = await enforceRateLimit(req, { bucket: 'lawn-size-confirm', limit: 30, windowSeconds: 3600 });
  if (limited) return limited;

  if (b.action === 'load') {
    const { data: r } = await admin.from('reservations')
      .select('first_name, lang, status, lawn_measured_sqft, lawn_verified_size, lawn_selected_size, lawn_old_monthly_cents, lawn_new_monthly_cents, lawn_size_confirmation')
      .eq('lawn_confirm_token', b.token).maybeSingle();
    if (!r) return jsonResponse({ ok: false, error: 'not_found' }, 404);
    return jsonResponse({ ok: true, offer: r });
  }

  const { data, error } = await admin.rpc('lawn_size_respond', { _token: b.token, _accept: b.accept });
  if (error) return jsonResponse({ ok: false, error: 'respond_failed' }, 500);
  return jsonResponse(data);
});
