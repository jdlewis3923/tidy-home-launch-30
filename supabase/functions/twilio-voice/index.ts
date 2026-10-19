import '../_shared/http.ts';
/**
 * twilio-voice — calls to the Tidy number ring Justin's phone (JUSTIN_ALERT_PHONE).
 *   Twilio webhook (form POST)   → TwiML <Dial> showing the caller's number.
 *   POST JSON {action:'setup'}   → admin only: points the Tidy number's voice URL here.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const FORWARD_TO = Deno.env.get('JUSTIN_ALERT_PHONE') ?? '+17868291141';
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const ct = req.headers.get('content-type') ?? '';

  if (ct.includes('application/json')) {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return jsonResponse({ error: 'unauthorized' }, 401);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: u.user.id, _role: 'admin' });
    if (!isAdmin) return jsonResponse({ error: 'forbidden' }, 403);
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID'); const tok = Deno.env.get('TWILIO_AUTH_TOKEN'); const from = Deno.env.get('TWILIO_FROM_NUMBER');
    if (!sid || !tok || !from) return jsonResponse({ error: 'twilio_not_configured' }, 500);
    const auth = 'Basic ' + btoa(`${sid}:${tok}`);
    const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;
    const list = await fetch(`${base}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`, { headers: { Authorization: auth } });
    const lj = await list.json().catch(() => ({}));
    const num = lj?.incoming_phone_numbers?.[0];
    if (!list.ok || !num) return jsonResponse({ error: 'number_not_found', status: list.status, details: lj }, 502);
    const upd = await fetch(`${base}/IncomingPhoneNumbers/${num.sid}.json`, {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ VoiceUrl: `${URL_}/functions/v1/twilio-voice`, VoiceMethod: 'POST' }),
    });
    const uj = await upd.json().catch(() => ({}));
    if (!upd.ok) return jsonResponse({ error: 'update_failed', status: upd.status, details: uj }, 502);
    return jsonResponse({ ok: true, voice_url: uj.voice_url, previous: num.voice_url ?? null, forward_to_last4: FORWARD_TO.slice(-4) });
  }

  // Twilio voice webhook
  const form = await req.formData().catch(() => null);
  const caller = String(form?.get('From') ?? '');
  const callerId = /^\+\d{8,15}$/.test(caller) ? ` callerId="${esc(caller)}"` : '';
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25"${callerId}>${esc(FORWARD_TO)}</Dial><Say voice="Polly.Joanna">Sorry, we missed you. Please text this number and Tidy will reply soon.</Say></Response>`;
  return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
});
