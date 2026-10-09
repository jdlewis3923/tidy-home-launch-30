// Lawn size changes on PAID plans (members who already have a Stripe subscription).
//   request (member) — add lawn to an existing plan: saved as pending verification; nothing billed, no visits.
//   correct (admin)  — a Pro reported an oversized yard (or admin re-measured): open + verify in one step.
//   verify  (admin)  — record turf-only measured sq ft; band + member's own rate-card price come from the DB.
//   load / respond (public, token) — the customer confirms or declines a size-up.
// Size-ups wait for the customer; size-downs and same-size adds apply straight away.
// The Stripe swap selects the new price by lookup_key only (never a raw price id).
// WRITE FIRST: every notice is a lawn_size_notices row before any email; a failed
// send or swap raises an admin alert and never undoes the verification.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { tidyEmailShell } from '../_shared/email-brand.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { stripeSecretKey } from '../_shared/stripe-mode.ts';
import { visitsPerMonthFor, type CanonCadence } from '../_shared/pricing-canon.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SITE = 'https://jointidy.co';
const NAMES: Record<string, { en: string; es: string }> = {
  '1': { en: 'Small', es: 'Pequeño' }, '2': { en: 'Standard', es: 'Estándar' }, '3': { en: 'Large', es: 'Grande' },
};
const money = (c: number | null | undefined) => (c == null ? '' : `$${Math.round(c / 100).toLocaleString('en-US')}`);

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), size: z.enum(['1', '2', '3', 'custom']), cadence: z.enum(['monthly', 'biweekly', 'weekly']) }),
  z.object({ action: z.literal('correct'), subscription_id: z.string().uuid(), measured_sqft: z.number().int().min(1).max(200000),
    source: z.enum(['pro_report', 'admin']).default('pro_report'), visit_id: z.string().uuid().optional(), note: z.string().max(500).optional() }),
  z.object({ action: z.literal('verify'), change_id: z.string().uuid(), measured_sqft: z.number().int().min(1).max(200000) }),
  z.object({ action: z.literal('load'), token: z.string().min(20).max(80) }),
  z.object({ action: z.literal('respond'), token: z.string().min(20).max(80), accept: z.boolean() }),
]);

// deno-lint-ignore no-explicit-any
function notice(kind: string, es: boolean, v: any): { subject: string; text: string; cta?: string } | null {
  const size = NAMES[v.verified_size]?.[es ? 'es' : 'en'] ?? '';
  const area = Number(v.measured_sqft).toLocaleString('en-US');
  if (kind === 'size_up') return {
    subject: es ? 'Confirma el tamaño de tu césped' : 'Please confirm your lawn size',
    text: es
      ? `Medimos tu césped desde arriba en unos ${area} pies², lo que lo coloca en nuestro tamaño ${size}. Tu plan de césped es ${money(v.new_cents)} al mes${v.old_cents != null ? ` en lugar de ${money(v.old_cents)}` : ''}. No se cobra nada hasta que lo confirmes.`
      : `We measured your lawn from above at about ${area} sq ft, which puts it in our ${size} size. Your lawn plan is ${money(v.new_cents)} a month${v.old_cents != null ? ` instead of ${money(v.old_cents)}` : ''}. Nothing is charged until you confirm.`,
    cta: `${SITE}/lawn-size/${v.token}?plan=1`,
  };
  if (kind === 'size_down') return {
    subject: es ? 'Tu plan de césped bajó de precio' : 'Your lawn plan just got lower',
    text: es
      ? `Medimos tu césped desde arriba en unos ${area} pies², lo que lo coloca en nuestro tamaño ${size}. Tu plan de césped queda en ${money(v.new_cents)} al mes${v.old_cents != null ? ` (antes ${money(v.old_cents)})` : ''}. No tienes que hacer nada.`
      : `We measured your lawn from above at about ${area} sq ft, which puts it in our ${size} size. Your lawn plan is now ${money(v.new_cents)} a month${v.old_cents != null ? ` (was ${money(v.old_cents)})` : ''}. Nothing for you to do.`,
  };
  if (kind === 'same' && v.change_kind === 'add_lawn') return {
    subject: es ? 'Tu césped está confirmado' : 'Your lawn is confirmed',
    text: es
      ? `Medimos tu césped desde arriba en unos ${area} pies² — tamaño ${size}, como elegiste. Lo agregamos a tu plan por ${money(v.new_cents)} al mes, en tu próxima factura combinada.`
      : `We measured your lawn from above at about ${area} sq ft — ${size}, as you picked. It's on your plan at ${money(v.new_cents)} a month, starting on your next combined bill.`,
  };
  if (kind === 'quote') return {
    subject: es ? 'Cotizaremos tu césped' : "We'll quote your lawn by hand",
    text: es
      ? `Medimos tu césped desde arriba en unos ${area} pies², más de 12,000 pies². Lo cotizamos a mano y te llamamos antes de cualquier cambio. No se cobra nada.`
      : `We measured your lawn from above at about ${area} sq ft — larger than 12,000 sq ft. We'll quote it by hand and call you before anything changes. Nothing is charged.`,
  };
  return null;
}

async function member(userId: string) {
  const [{ data: u }, { data: p }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from('profiles').select('first_name, language').eq('id', userId).maybeSingle(),
  ]);
  return { email: u?.user?.email ?? null, first_name: p?.first_name ?? '', es: (p?.language ?? 'en').trim() === 'es' };
}

// deno-lint-ignore no-explicit-any
async function tell(change: any, v: any) {
  const m = await member(change.user_id);
  const n = notice(v.kind, m.es, v);
  if (!n || !m.email) return 'skipped';
  const { data: row } = await admin.from('lawn_size_notices').insert({ reservation_id: null, kind: v.kind, email: m.email, subject: n.subject, body: n.text }).select('id').single();
  try {
    const sent = await sendBrevoEmail({ to: { email: m.email, name: m.first_name }, marketing: false, subject: n.subject, label: 'lawn-size-notice',
      htmlContent: tidyEmailShell({ heading: n.subject, eyebrow: 'Lawn Care', bodyHtml: `<p>${m.first_name},</p><p>${n.text}</p>`, ctaUrl: n.cta, ctaLabel: n.cta ? (m.es ? 'Revisar y confirmar' : 'Review and confirm') : undefined }) });
    await admin.from('lawn_size_notices').update({ email_status: sent.sent ? 'sent' : 'failed', email_error: sent.sent ? null : (sent.reason ?? 'send failed'), sent_at: sent.sent ? new Date().toISOString() : null }).eq('id', row?.id);
    if (!sent.sent) throw new Error(sent.reason ?? 'send failed');
    return 'sent';
  } catch (e) {
    await writeAlert(admin, { level: 'warning', category: 'reservations', title: 'Lawn size notice did not send', body: `${m.first_name}'s lawn was measured, but the email did not send: ${e instanceof Error ? e.message : String(e)}. Tell them before the next lawn visit.`, action_label: 'Open lawn verification', action_url: '/admin/lawn-verification', dedupe_key: `lawn_plan_notice:${change.id}:${v.kind}`, context: { change_id: change.id } });
    return 'failed';
  }
}

/** Swap (or add, or remove) the lawn item on the member's Stripe subscription. Lookup_key only. */
async function applyChange(changeId: string, remove = false): Promise<{ ok: boolean; error?: string }> {
  const { data: c } = await admin.from('lawn_plan_changes').select('*').eq('id', changeId).single();
  if (!c) return { ok: false, error: 'not_found' };
  if (!remove && c.status !== 'ready_to_apply') return { ok: false, error: `not_ready:${c.status}` };
  try {
    const key = stripeSecretKey();
    if (!key) throw new Error('stripe_not_configured');
    const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() });
    const { data: sub } = await admin.from('subscriptions').select('id, stripe_subscription_id, services, plan_lines, sizes_json').eq('id', c.subscription_id).single();
    if (!sub?.stripe_subscription_id) throw new Error('subscription_not_found');
    const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, { expand: ['items.data.price'] });
    const lawnItem = current.items.data.find((i) => (i.price.lookup_key ?? '').startsWith('lawn_'));
    // deno-lint-ignore no-explicit-any
    let items: any[];
    // deno-lint-ignore no-explicit-any
    let lines: any[] = (Array.isArray(sub.plan_lines) ? sub.plan_lines : []).filter((l: any) => l.service !== 'lawn');
    let services: string[] = (sub.services ?? []).filter((s: string) => s !== 'lawn');
    const sizes = { ...((sub.sizes_json && typeof sub.sizes_json === 'object') ? sub.sizes_json : {}) } as Record<string, unknown>;
    if (remove) {
      if (!lawnItem) return { ok: true };
      items = [{ id: lawnItem.id, deleted: true }];
      delete sizes.lawn;
    } else {
      if (!c.lookup_key) throw new Error('no_lookup_key');
      const found = await stripe.prices.list({ lookup_keys: [c.lookup_key], active: true, limit: 1 });
      const price = found.data[0];
      if (!price) throw new Error(`no_active_price_for_lookup_key:${c.lookup_key}`);
      items = lawnItem ? [{ id: lawnItem.id, price: price.id, quantity: 1 }] : [{ price: price.id, quantity: 1 }];
      const vpm = visitsPerMonthFor('lawn', c.cadence as CanonCadence);
      lines = [...lines, { service: 'lawn', size_tier: Number(c.verified_size), cadence: c.cadence, surcharge_applied: false, surcharge_cents: 0,
        visits_per_month: vpm, per_visit_cents: Math.round((price.unit_amount ?? 0) / vpm), monthly_cents: price.unit_amount ?? 0,
        lookup_key: c.lookup_key, stripe_price_id: price.id }];
      services = [...services, 'lawn'];
      sizes.lawn = Number(c.verified_size);
    }
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items, proration_behavior: 'none', payment_behavior: 'error_if_incomplete',
      metadata: { ...current.metadata, sizes_json: JSON.stringify(sizes) },
    });
    const total = updated.items.data.reduce((s, i) => s + (i.price.unit_amount ?? 0) * (i.quantity ?? 1), 0);
    const { error: upErr } = await admin.from('subscriptions').update({
      services, plan_lines: lines, sizes_json: sizes, monthly_total_cents: total,
      lawn_measured_sqft: remove ? null : c.measured_sqft,
    }).eq('id', sub.id);
    if (upErr) throw new Error(`local_update_failed:${upErr.message}`);
    if (!remove) {
      // Upcoming lawn visits move to the verified size and its Pro pay.
      const { data: visits } = await admin.from('visits').select('id, cadence').eq('subscription_id', sub.id).eq('service_type', 'lawn').in('status', ['scheduled']);
      for (const v of visits ?? []) {
        const { data: pay } = await admin.rpc('contractor_visit_pay_cents', { _service: 'lawn', _size: Number(c.verified_size), _cadence: v.cadence ?? c.cadence });
        await admin.from('visits').update({ size_tier: Number(c.verified_size), contractor_pay_cents: pay }).eq('id', v.id);
      }
      await admin.rpc('generate_recurring_visits', { _subscription_id: sub.id, _horizon_days: 45 });
      await admin.from('lawn_plan_changes').update({ status: 'applied', applied_at: new Date().toISOString(), apply_error: null }).eq('id', c.id);
    } else {
      await admin.from('visits').update({ status: 'canceled' }).eq('subscription_id', sub.id).eq('service_type', 'lawn').eq('status', 'scheduled');
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!remove) await admin.from('lawn_plan_changes').update({ status: 'failed', apply_error: msg }).eq('id', c.id);
    await writeAlert(admin, { level: 'critical', category: 'reservations', title: 'Lawn plan change did not apply', body: `The measured lawn size could not be applied to a member's plan: ${msg}. The measurement is saved; retry from lawn verification.`, action_label: 'Open lawn verification', action_url: '/admin/lawn-verification', dedupe_key: `lawn_plan_apply:${c.id}`, context: { change_id: c.id } });
    return { ok: false, error: msg };
  }
}

// deno-lint-ignore no-explicit-any
async function verifyAndAct(req: Request, changeId: string, measured: number, asService: boolean): Promise<any> {
  const caller = asService ? admin : createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const { data: v, error } = await caller.rpc('admin_lawn_plan_verify', { _change: changeId, _measured: measured });
  if (error) return { ok: false, error: error.message, status: error.code === '42501' ? 403 : 400 };
  const { data: change } = await admin.from('lawn_plan_changes').select('*').eq('id', changeId).single();
  let applied = null;
  if (v.status === 'ready_to_apply') applied = await applyChange(changeId);
  const email_status = await tell(change, v);
  return { ok: true, result: { ...v, token: undefined }, applied, email_status };
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body' }, 400);
  const b = parsed.data;

  if (b.action === 'request') {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    const { data: sub } = await admin.from('subscriptions').select('id, services, stripe_subscription_id').eq('user_id', u.user.id).in('status', ['active', 'paused']).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!sub?.stripe_subscription_id) return jsonResponse({ ok: false, error: 'existing_subscription_not_found' }, 400);
    if ((sub.services ?? []).includes('lawn')) return jsonResponse({ ok: false, error: 'service_already_on_subscription' }, 400);
    const { data: open } = await admin.from('lawn_plan_changes').select('id').eq('subscription_id', sub.id).in('status', ['pending_verification', 'awaiting_customer', 'ready_to_apply']).maybeSingle();
    if (open) return jsonResponse({ ok: true, pending_verification: true, change_id: open.id, already: true });
    const { data: row, error } = await admin.from('lawn_plan_changes').insert({ subscription_id: sub.id, user_id: u.user.id, kind: 'add_lawn', source: 'member_add', cadence: b.cadence, selected_size: b.size }).select('id').single();
    if (error) return jsonResponse({ ok: false, error: 'could_not_save' }, 500);
    await writeAlert(admin, { level: 'info', category: 'reservations', title: 'Lawn added from an account — measure it', body: 'A member added lawn to their plan. Measure the turf from above; nothing is billed and no lawn visit is scheduled until you do.', action_label: 'Open lawn verification', action_url: '/admin/lawn-verification', dedupe_key: `lawn_plan_add:${row.id}`, context: { change_id: row.id } });
    return jsonResponse({ ok: true, pending_verification: true, change_id: row.id });
  }

  if (b.action === 'verify' || b.action === 'correct') {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
    const asService = auth.kind === 'service';
    let changeId = b.action === 'verify' ? b.change_id : '';
    if (b.action === 'correct') {
      const { data: sub } = await admin.from('subscriptions').select('id, user_id, services, plan_lines, sizes_json').eq('id', b.subscription_id).single();
      if (!sub || !(sub.services ?? []).includes('lawn')) return jsonResponse({ ok: false, error: 'no_lawn_on_plan' }, 400);
      // deno-lint-ignore no-explicit-any
      const line = (Array.isArray(sub.plan_lines) ? sub.plan_lines : []).find((l: any) => l.service === 'lawn');
      const size = String(line?.size_tier ?? (sub.sizes_json as Record<string, unknown>)?.lawn ?? '');
      if (!['1', '2', '3'].includes(size) || !line?.cadence) return jsonResponse({ ok: false, error: 'current_lawn_size_unknown' }, 400);
      const { data: row, error } = await admin.from('lawn_plan_changes').insert({ subscription_id: sub.id, user_id: sub.user_id, kind: 'correction', source: b.source, cadence: line.cadence, selected_size: size, visit_id: b.visit_id ?? null, note: b.note ?? null }).select('id').single();
      if (error) return jsonResponse({ ok: false, error: error.code === '23505' ? 'change_already_open' : 'could_not_save' }, 400);
      changeId = row.id;
    }
    const out = await verifyAndAct(req, changeId, b.measured_sqft, asService);
    return jsonResponse(out, out.ok ? 200 : (out.status ?? 400));
  }

  const limited = await enforceRateLimit(req, { bucket: 'lawn-size-confirm', limit: 30, windowSeconds: 3600 });
  if (limited) return limited;

  if (b.action === 'load') {
    const { data: c } = await admin.from('lawn_plan_changes').select('user_id, kind, status, measured_sqft, verified_size, selected_size, old_monthly_cents, new_monthly_cents').eq('confirm_token', b.token).maybeSingle();
    if (!c) return jsonResponse({ ok: false, error: 'not_found' }, 404);
    const m = await member(c.user_id);
    const state = c.status === 'awaiting_customer' ? 'pending' : c.status === 'declined' ? 'declined' : 'confirmed';
    return jsonResponse({ ok: true, offer: { first_name: m.first_name, kind: c.kind, status: c.status, lawn_measured_sqft: c.measured_sqft, lawn_verified_size: c.verified_size,
      lawn_selected_size: c.selected_size, lawn_old_monthly_cents: c.old_monthly_cents, lawn_new_monthly_cents: c.new_monthly_cents, lawn_size_confirmation: state } });
  }

  const { data, error } = await admin.rpc('lawn_plan_respond', { _token: b.token, _accept: b.accept });
  if (error || !data?.ok) return jsonResponse({ ok: false, error: 'respond_failed' }, 500);
  if (data.result === 'confirmed') {
    const applied = await applyChange(data.id);
    return jsonResponse({ ok: applied.ok, result: 'confirmed', error: applied.ok ? undefined : 'apply_failed' });
  }
  // Declining a size-up never shrinks the visit: a correction ends the lawn service; an add simply doesn't happen.
  if (data.result === 'declined' && data.kind === 'correction') await applyChange(data.id, true);
  return jsonResponse(data);
});
