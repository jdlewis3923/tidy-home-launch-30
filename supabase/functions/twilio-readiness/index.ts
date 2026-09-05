// Tidy — Messaging readiness probe (Twilio)
//
// Admin-only. Verifies the outbound SMS sender end to end instead of trusting
// the TWILIO_FROM_NUMBER secret:
//   1. Is TWILIO_FROM_NUMBER set at all?
//   2. Is that exact number in the account's IncomingPhoneNumbers list?
//      (If not, we name the numbers the account DOES own.)
//   3. Do that number's capabilities include SMS?
//   4. A2P 10DLC campaign status (US long code) or toll-free verification
//      status — an unregistered long code is filtered by carriers even when
//      everything else is correct.
//
// Called by /admin/setup-check (Messaging readiness card) and by the Command
// view, which renders a red banner when overall === 'fail'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const FROM = (Deno.env.get('TWILIO_FROM_NUMBER') ?? '').trim();
// Number to probe when the secret is unset — proposed, never assumed valid.
const CANDIDATE_DEFAULT = '+17868291141';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Status = 'pass' | 'warn' | 'fail';
type Check = { id: string; label: string; status: Status; detail: string; remediation?: string };

const TOLL_FREE = /^\+1(800|833|844|855|866|877|888)/;

function authHeader() {
  return { Authorization: `Basic ${btoa(`${SID}:${TOKEN}`)}` };
}

async function twilio(url: string) {
  const r = await fetch(url, { headers: authHeader() });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
  return { ok: r.ok, status: r.status, json, text };
}

function worst(checks: Check[]): Status {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'pass';
}

async function a2pCheck(numberSid: string, phone: string): Promise<Check> {
  const id = 'twilio_a2p';
  const label = 'Carrier registration (A2P 10DLC / toll-free)';

  if (TOLL_FREE.test(phone)) {
    const r = await twilio(
      `https://messaging.twilio.com/v1/Tollfree/Verifications?PhoneNumber=${encodeURIComponent(phone)}`,
    );
    if (!r.ok) {
      return { id, label, status: 'warn',
        detail: `Toll-free verification lookup failed (HTTP ${r.status}): ${r.text.slice(0, 140)}`,
        remediation: 'Check the Twilio credential has Messaging read access, then re-run.' };
    }
    const v = (r.json?.verifications ?? [])[0];
    const state = String(v?.status ?? 'none');
    if (state === 'TWILIO_APPROVED') {
      return { id, label, status: 'pass', detail: 'Toll-free verification approved.' };
    }
    return { id, label, status: 'fail',
      detail: state === 'none'
        ? 'No toll-free verification submitted — carriers will filter this number.'
        : `Toll-free verification status: ${state} — not yet approved, carriers may filter messages.`,
      remediation: 'Submit or complete toll-free verification in Twilio Messaging before sending customer texts.' };
  }

  if (!phone.startsWith('+1')) {
    return { id, label, status: 'warn', detail: 'Non-US number — A2P 10DLC does not apply. Verify local carrier rules manually.' };
  }

  // US long code: find the Messaging Service holding this number, then read its
  // US A2P compliance (campaign) record.
  const svc = await twilio('https://messaging.twilio.com/v1/Services?PageSize=50');
  if (!svc.ok) {
    return { id, label, status: 'warn',
      detail: `Messaging Services lookup failed (HTTP ${svc.status}): ${svc.text.slice(0, 140)}`,
      remediation: 'Grant the Twilio credential Messaging read access, then re-run.' };
  }
  const services: any[] = svc.json?.services ?? [];
  for (const s of services) {
    const nums = await twilio(`https://messaging.twilio.com/v1/Services/${s.sid}/PhoneNumbers?PageSize=100`);
    if (!nums.ok) continue;
    const hit = (nums.json?.phone_numbers ?? []).some(
      (n: any) => n?.phone_number === phone || n?.sid === numberSid,
    );
    if (!hit) continue;

    const usa2p = await twilio(`https://messaging.twilio.com/v1/Services/${s.sid}/Compliance/Usa2p`);
    if (!usa2p.ok) {
      return { id, label, status: 'fail',
        detail: `Number is in Messaging Service "${s.friendly_name ?? s.sid}" but no A2P 10DLC campaign is registered (HTTP ${usa2p.status}).`,
        remediation: 'Register a 10DLC brand and campaign in Twilio and attach this Messaging Service.' };
    }
    const rec = usa2p.json?.compliance?.[0] ?? usa2p.json?.us_app_to_person?.[0] ?? usa2p.json ?? {};
    const state = String(
      rec?.campaign_status ?? rec?.status ?? usa2p.json?.campaign_status ?? 'UNKNOWN',
    );
    const useCase = rec?.us_app_to_person_usecase ? ` (use case ${rec.us_app_to_person_usecase})` : '';
    if (state === 'UNKNOWN') {
      return { id, label, status: 'fail',
        detail: `No A2P 10DLC campaign found on Messaging Service "${s.friendly_name ?? s.sid}" — carriers filter unregistered long codes.`,
        remediation: 'Register a 10DLC brand and campaign in Twilio for this Messaging Service, then re-run this check.' };
    }
    if (/verified|approved|active|success/i.test(state)) {
      return { id, label, status: 'pass',
        detail: `10DLC campaign ${state} on Messaging Service "${s.friendly_name ?? s.sid}"${useCase}.` };
    }
    return { id, label, status: 'fail',
      detail: `10DLC campaign status is ${state} on "${s.friendly_name ?? s.sid}"${useCase} — carriers filter unregistered long codes.`,
      remediation: 'Finish 10DLC brand/campaign registration in Twilio before sending customer texts.' };
  }

  return { id, label, status: 'fail',
    detail: 'This US long code is not attached to any Messaging Service, so it has no A2P 10DLC campaign. Carriers filter unregistered long codes.',
    remediation: 'Create a Messaging Service in Twilio, register a 10DLC brand and campaign, and add this number to the service.' };
}

async function runChecks(candidate?: string): Promise<{ overall: Status; checks: Check[]; owned_numbers: string[]; from: string; tested: string; source: 'secret' | 'candidate' }> {
  const checks: Check[] = [];
  const owned: string[] = [];

  // Candidate mode: when the secret is unset we still probe the proposed
  // number so the account's real numbers can be seen before saving anything.
  const cand = (candidate ?? '').trim() || CANDIDATE_DEFAULT;
  const phone = FROM || cand;
  const source: 'secret' | 'candidate' = FROM ? 'secret' : 'candidate';

  // 1 — secret present
  if (!FROM) {
    checks.push({ id: 'twilio_from_set', label: 'TWILIO_FROM_NUMBER is set', status: 'fail',
      detail: `TWILIO_FROM_NUMBER is not set — no SMS of any kind can send. Testing candidate ${phone} against the account instead.`,
      remediation: 'Save the verified Twilio sending number in E.164 form (e.g. +17865551234) as TWILIO_FROM_NUMBER.' });
  } else {
    checks.push({ id: 'twilio_from_set', label: 'TWILIO_FROM_NUMBER is set', status: 'pass', detail: FROM });
  }

  if (!SID || !TOKEN) {
    checks.push({ id: 'twilio_credentials', label: 'Twilio account credentials', status: 'fail',
      detail: 'TWILIO_ACCOUNT_SID and/or TWILIO_AUTH_TOKEN are not set — the number cannot be verified against the account.',
      remediation: 'Save both TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN, then re-run this check.' });
    return { overall: 'fail', checks, owned_numbers: owned, from: phone, tested: phone, source };
  }

  // 2 — owned by the account
  const list = await twilio(
    `https://api.twilio.com/2010-04-01/Accounts/${SID}/IncomingPhoneNumbers.json?PageSize=100`,
  );
  if (!list.ok) {
    checks.push({ id: 'twilio_owned', label: 'Number is owned by the Twilio account', status: 'fail',
      detail: `Could not read IncomingPhoneNumbers (HTTP ${list.status}): ${list.text.slice(0, 160)}`,
      remediation: 'Verify TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are current and have API access.' });
    return { overall: 'fail', checks, owned_numbers: owned, from: phone, tested: phone, source };
  }

  const nums: any[] = list.json?.incoming_phone_numbers ?? [];
  for (const n of nums) if (n?.phone_number) owned.push(String(n.phone_number));
  const match = nums.find((n) => String(n?.phone_number) === phone);

  if (!match) {
    checks.push({ id: 'twilio_owned', label: 'Number is owned by the Twilio account', status: 'fail',
      detail: owned.length
        ? `${phone} cannot send — it is not owned by this Twilio account. The account owns: ${owned.join(', ')}.`
        : `${phone} cannot send — this Twilio account owns no phone numbers at all.`,
      remediation: owned.length
        ? `Set TWILIO_phone_NUMBER to one of the owned numbers above.`
        : 'Buy or port a number in Twilio, then set TWILIO_phone_NUMBER to it.' });
    return { overall: 'fail', checks, owned_numbers: owned, from: phone, tested: phone, source };
  }
  checks.push({ id: 'twilio_owned', label: 'Number is owned by the Twilio account', status: 'pass',
    detail: `${phone} found on the account${match.friendly_name ? ` ("${match.friendly_name}")` : ''}.` });

  // 3 — SMS capability
  const smsCapable = Boolean(match?.capabilities?.sms);
  checks.push(smsCapable
    ? { id: 'twilio_sms_capable', label: 'Number supports SMS', status: 'pass', detail: 'Capabilities include SMS.' }
    : { id: 'twilio_sms_capable', label: 'Number supports SMS', status: 'fail',
        detail: `${phone} has no SMS capability (capabilities: ${Object.entries(match?.capabilities ?? {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}).`,
        remediation: 'Pick a Twilio number with SMS capability and set TWILIO_phone_NUMBER to it.' });

  // 4 — carrier registration
  try {
    checks.push(await a2pCheck(String(match.sid ?? ''), phone));
  } catch (e) {
    checks.push({ id: 'twilio_a2p', label: 'Carrier registration (A2P 10DLC / toll-free)', status: 'warn',
      detail: `Registration lookup failed: ${(e as Error).message}` });
  }

  return { overall: worst(checks), checks, owned_numbers: owned, from: phone, tested: phone, source };
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return jsonResponse({ error: 'unauthorized' }, 401);
  const { data: roleRow } = await admin
    .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (!roleRow) return jsonResponse({ error: 'forbidden' }, 403);

  try {
    let candidate: string | undefined;
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const c = (body as { candidate?: unknown })?.candidate;
      if (typeof c === 'string' && /^\+[1-9]\d{6,14}$/.test(c.trim())) candidate = c.trim();
    }
    const result = await runChecks(candidate);
    if (result.overall === 'fail') {
      console.error('[twilio-readiness] FAIL', JSON.stringify(result.checks));
    }
    return jsonResponse({ ok: true, checked_at: new Date().toISOString(), ...result });
  } catch (e) {
    console.error('[twilio-readiness] error', (e as Error).message);
    return jsonResponse({ error: 'probe_failed', detail: (e as Error).message }, 500);
  }
});
