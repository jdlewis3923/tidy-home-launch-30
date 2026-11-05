import '../_shared/http.ts';
// jobber-webhook — Jobber is the schedule of record (Nov 2026).
// Verifies X-Jobber-Hmac-SHA256 (base64 HMAC-SHA256 of the raw body with the
// app client secret), logs every event, then syncs the visit/job to the
// jobber_visits mirror and Connecteam via jobber-sync.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function hmac(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function callSync(payload: Record<string, unknown>) {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/jobber-sync`, {
    method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.text()).slice(0, 500) };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const raw = await req.text();
  const given = req.headers.get('x-jobber-hmac-sha256') ?? '';
  const expected = await hmac(Deno.env.get('JOBBER_CLIENT_SECRET') ?? '', raw);
  const valid = given.length > 0 && given === expected;
  let evt: any = {};
  try { evt = JSON.parse(raw)?.data?.webHookEvent ?? {}; } catch { /* ignore */ }
  const { data: row } = await db.from('jobber_webhook_log').insert({ event_type: evt.topic ?? 'unknown', jobber_visit_id: evt.itemId ?? null, payload: evt, signature_valid: valid } as any).select('id').single();
  if (!valid) return new Response('invalid signature', { status: 401 });
  let result: unknown = null; let err: string | null = null;
  try {
    if (String(evt.topic).startsWith('VISIT_')) result = await callSync({ action: 'sync_visit', jobber_visit_id: evt.itemId });
    else if (evt.topic === 'JOB_UPDATE') result = await callSync({ action: 'reconcile', days: 21 });
  } catch (e) { err = (e as Error).message; }
  if (row?.id) await db.from('jobber_webhook_log').update({ processed_at: new Date().toISOString(), error_message: err ?? JSON.stringify(result)?.slice(0, 500) }).eq('id', row.id);
  return new Response(JSON.stringify({ ok: !err }), { headers: { 'Content-Type': 'application/json' } });
});
