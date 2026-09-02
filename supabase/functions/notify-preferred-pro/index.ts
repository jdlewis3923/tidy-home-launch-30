// Tidy — A1. A customer named a Pro as their preferred Pro.
//
// Fired by the public.on_preferred_pro_changed trigger (pg_net), never by a
// client. Notifies THAT PRO in-app/push only — no SMS, no email.
//
// Debounce is absolute: the (customer_id, pro_id) pair is written to
// public.notified_pro_preference and a pair that already exists is skipped
// forever. A customer flipping the dropdown back and forth can never reach
// the Pro twice.
//
// A4 (switching away) is deliberately NOT handled here — the trigger records
// it in preferred_pro_changes for the admin trend view and nobody is told.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { notifyPro } from '../_shared/pro-notify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SERVICE_LABEL: Record<string, string> = {
  cleaning: 'cleaning',
  lawn: 'lawn',
  detail: 'car',
  detailing: 'car',
};

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  let body: { customer_id?: string; pro_id?: string; subscription_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }
  const customerId = body.customer_id;
  const proId = body.pro_id;
  if (!customerId || !proId) {
    return jsonResponse({ ok: false, error: 'customer_id and pro_id required' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Hard debounce — the unique index is the real gate, so a race loses safely.
  const { data: claim, error: claimErr } = await admin
    .from('notified_pro_preference')
    .insert({ customer_id: customerId, pro_id: proId })
    .select('id')
    .maybeSingle();
  if (claimErr || !claim) {
    console.info('[notify-preferred-pro] already notified, skipping', {
      customerId, proId, reason: claimErr?.code ?? 'no_row',
    });
    return jsonResponse({ ok: true, notified: false, reason: 'already_notified' });
  }

  const [{ data: pro }, { data: profile }, { data: sub }] = await Promise.all([
    admin.from('applicants').select('first_name, contractor_id').eq('id', proId).maybeSingle(),
    admin.from('profiles').select('first_name').eq('user_id', customerId).maybeSingle(),
    admin.from('subscriptions').select('services, service').eq('user_id', customerId).maybeSingle(),
  ]);

  if (!pro?.contractor_id) {
    return jsonResponse({ ok: true, notified: false, reason: 'pro_has_no_login' });
  }

  const rawServices: string[] = Array.isArray((sub as { services?: string[] } | null)?.services)
    ? ((sub as { services?: string[] }).services ?? [])
    : [((sub as { service?: string } | null)?.service ?? '')].filter(Boolean);
  const services = rawServices.map((s) => SERVICE_LABEL[s] ?? s).filter(Boolean);
  const serviceLabel = services.length ? services.join(' + ') : 'upcoming';
  const customerFirst = profile?.first_name?.trim() || 'A customer';

  await admin
    .from('notified_pro_preference')
    .update({ service: serviceLabel })
    .eq('id', claim.id);

  const title = 'You were asked for by name';
  const message = `${customerFirst} asked for you by name for their ${serviceLabel} visits.`;

  await notifyPro(admin, {
    contractor_id: pro.contractor_id,
    kind: 'preferred_pro_named',
    title,
    body: message,
    url: '/pro',
    context: { customer_id: customerId, pro_id: proId, service: serviceLabel },
  });

  return jsonResponse({ ok: true, notified: true, message });
});
