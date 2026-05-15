// sheets-master-sync — pushes Tidy operational data into the master Google Sheet
// using a service-account JWT (GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON).
//
// Tabs written (created on first run if missing):
//   - Applicants
//   - Visits
//   - Tier Readiness Snapshot
//   - Tier Audit Log
//
// Sheet ID (master): 13WGFqOTt_ccRwVVR_FU2VKKE1N91HASZHdhHpMjgunc
//
// This is write-mostly. Bidirectional read of admin notes can be wired by a
// follow-up call once the team confirms which Applicants column they want to
// own from Sheets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SA_JSON = Deno.env.get('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON') ?? '';
const SHEET_ID = '13WGFqOTt_ccRwVVR_FU2VKKE1N91HASZHdhHpMjgunc';

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

interface SaCreds { client_email: string; private_key: string }

async function getAccessToken(): Promise<string> {
  const creds = JSON.parse(SA_JSON) as SaCreds;
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${enc(header)}.${enc(claim)}`;

  const pem = creds.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const sigB64 = btoa(String.fromCharCode(...sig)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${unsigned}.${sigB64}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token exchange failed: ${JSON.stringify(j)}`);
  return j.access_token as string;
}

async function ensureTabs(token: string) {
  // Get existing sheets
  const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const existing = new Set<string>((meta.sheets ?? []).map((s: any) => s.properties.title));
  const wanted = ['Applicants', 'Visits', 'Tier Readiness Snapshot', 'Tier Audit Log'];
  const missing = wanted.filter((t) => !existing.has(t));
  if (missing.length === 0) return;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  });
}

async function writeRange(token: string, range: string, values: unknown[][]) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueInputOption=RAW`;
  await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
}

async function clearRange(token: string, range: string) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}:clear`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (!SA_JSON) return jsonResponse({ ok: false, skipped: 'GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON missing' }, 503);

  let token: string;
  try { token = await getAccessToken(); }
  catch (err) { return jsonResponse({ ok: false, error: (err as Error).message }, 500); }

  try { await ensureTabs(token); } catch (_) { /* best-effort */ }

  // 1) Applicants
  const { data: apps } = await admin.from('applicants').select(
    'id, first_name, last_name, email, phone, zip, service, role, current_stage, tier, tier_readiness_status, completed_visits, avg_customer_rating, contractor_cancel_rate, complaint_rate, photo_compliance_rate, open_escalations_count, coi_review_status, coi_expires_at, contractor_id, jobber_id, last_visit_at, updated_at',
  );
  const aHeader = ['ApplicantID','FirstName','LastName','Email','Phone','ZIP','Service','Role','Stage','Tier','Readiness','CompletedVisits','AvgRating','CancelRate','ComplaintRate','PhotoRate','OpenEscalations','COIStatus','COIExpiresAt','ContractorID','JobberID','LastVisitAt','UpdatedAt'];
  const aRows = (apps ?? []).map((a) => [a.id,a.first_name,a.last_name,a.email,a.phone,a.zip,a.service,a.role,a.current_stage,a.tier,a.tier_readiness_status,a.completed_visits,a.avg_customer_rating,a.contractor_cancel_rate,a.complaint_rate,a.photo_compliance_rate,a.open_escalations_count,a.coi_review_status,a.coi_expires_at,a.contractor_id,a.jobber_id,a.last_visit_at,a.updated_at]);
  await clearRange(token, 'Applicants!A:Z');
  await writeRange(token, 'Applicants!A1', [aHeader, ...aRows]);

  // 2) Visits (last 500)
  const { data: visits } = await admin.from('pro_visits').select('id, contractor_id, jobber_visit_id, customer_name, service_type, scheduled_at, completed_at, status, customer_rating, photos_count, photos_expected, amount_cents').order('scheduled_at', { ascending: false }).limit(500);
  const vHeader = ['VisitID','ContractorID','JobberVisitID','Customer','Service','ScheduledAt','CompletedAt','Status','Rating','PhotosUploaded','PhotosExpected','AmountCents'];
  const vRows = (visits ?? []).map((v) => [v.id,v.contractor_id,v.jobber_visit_id,v.customer_name,v.service_type,v.scheduled_at,v.completed_at,v.status,v.customer_rating,v.photos_count,v.photos_expected,v.amount_cents]);
  await clearRange(token, 'Visits!A:Z');
  await writeRange(token, 'Visits!A1', [vHeader, ...vRows]);

  // 3) Tier Readiness Snapshot
  const { data: snap } = await admin.from('applicants').select('id, first_name, last_name, tier, tier_readiness_status, completed_visits, avg_customer_rating, contractor_cancel_rate, complaint_rate, photo_compliance_rate, open_escalations_count').eq('current_stage','active');
  const sHeader = ['SnapshotAt','ApplicantID','Name','Tier','Readiness','Visits','AvgRating','CancelRate','ComplaintRate','PhotoRate','OpenEscalations'];
  const ts = new Date().toISOString();
  const sRows = (snap ?? []).map((a) => [ts, a.id, `${a.first_name} ${a.last_name}`, a.tier, a.tier_readiness_status, a.completed_visits, a.avg_customer_rating, a.contractor_cancel_rate, a.complaint_rate, a.photo_compliance_rate, a.open_escalations_count]);
  await clearRange(token, 'Tier Readiness Snapshot!A:Z');
  await writeRange(token, 'Tier Readiness Snapshot!A1', [sHeader, ...sRows]);

  // 4) Tier Audit Log
  const { data: events } = await admin.from('onboarding_events').select('id, applicant_id, event, metadata, created_at').in('event', ['tier_2_promoted','tier_returned_to_1','coi_approved','coi_rejected','readiness_recalculated']).order('created_at', { ascending: false }).limit(500);
  const eHeader = ['EventID','ApplicantID','Event','Metadata','CreatedAt'];
  const eRows = (events ?? []).map((e) => [e.id, e.applicant_id, e.event, JSON.stringify(e.metadata ?? {}), e.created_at]);
  await clearRange(token, 'Tier Audit Log!A:Z');
  await writeRange(token, 'Tier Audit Log!A1', [eHeader, ...eRows]);

  return jsonResponse({ ok: true, applicants: aRows.length, visits: vRows.length, snapshots: sRows.length, audit: eRows.length });
});
