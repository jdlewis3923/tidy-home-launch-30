import '../_shared/http.ts';
// Signing self-test: creates throwaway is_test Pros (cleaning EN, lawn EN, cleaning ES),
// signs each through the real in-app contract-sign path, verifies every post-sign link,
// then deletes the fixtures. Any failure → URGENT owner alert. Never touches real records.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = createClient(URL_, KEY, { auth: { persistSession: false } });
const reply = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Case = { key: string; service: 'cleaning' | 'lawn'; lang: 'en' | 'es' };
const CASES: Case[] = [
  { key: 'cleaning', service: 'cleaning', lang: 'en' },
  { key: 'lawn', service: 'lawn', lang: 'en' },
  { key: 'spanish_ica', service: 'cleaning', lang: 'es' },
];
async function sign(token: string, body: Record<string, unknown>) {
  const r = await fetch(`${URL_}/functions/v1/contract-sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, 'User-Agent': 'tidy-signing-selftest' },
    body: JSON.stringify({ token, ...body }),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

async function runCase(c: Case, keep: boolean) {
  const id = crypto.randomUUID();
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
  const checks: Record<string, boolean | string> = {};
  try {
    const ins = await db.from('applicants').insert({
      id, first_name: 'Selftest', last_name: `${c.key} Pro`, email: `selftest+${id.slice(0, 8)}@example.invalid`,
      phone: `+1305555${String(100 + Math.floor(Math.random() * 100)).padStart(4, '0')}`, /* fictional 555-01xx */ service: c.service, preferred_language: c.lang, is_test_row: true, contract_token: token,
    });
    if (ins.error) throw new Error(`fixture_applicant:${ins.error.message}`);
    const pip = await db.rpc('signing_selftest_fixture', { _id: id, _service: c.service });
    if (pip.error) throw new Error(`fixture_pipeline:${pip.error.message}`);

    const doc = await sign(token, { action: 'document' });
      checks.document_ok = doc.status === 200 && doc.data?.ok === true;
      checks.document_version = String(doc.data?.version ?? doc.data?.error ?? doc.status);
      if (!checks.document_ok) throw new Error(`document:${doc.data?.error ?? doc.status}`);
  
      const s = await sign(token, { action: 'sign', typed_name: `Selftest ${c.key} Pro`, business_name: '', agreed: true, version: doc.data.version });
      checks.sign_ok = s.status === 200 && s.data?.ok === true;
      if (!checks.sign_ok) throw new Error(`sign:${s.data?.error ?? s.status}`);

    // Welcome skip is dispatched asynchronously by the database; poll briefly.
    let ev: string[] = [];
    for (let i = 0; i < 10; i++) {
      const { data } = await db.from('onboarding_events').select('event').eq('applicant_id', id);
      ev = (data ?? []).map((e: any) => e.event);
      if (ev.includes('welcome_t1_test_skip')) break;
      await sleep(1500);
    }
    const { data: a } = await db.from('applicants').select('contracts_signed,contracts_signed_at,pro_number,signing_day_signed_at,contract_sent_at,contract_signed_pdf_path,sequence_stage').eq('id', id).single();
    const { data: sig } = await db.from('contract_signatures').select('id,signed_pdf_path,pro_number,template_service').eq('applicant_id', id);
    const { data: p } = await db.from('contractor_pipeline').select('stage,agreement_docs_sent_at,screening_call_completed_at').eq('applicant_id', id).single();
    const { data: se } = await db.from('contractor_stage_events').select('kind,to_stage').eq('applicant_id', id);
    const { data: al } = await db.from('admin_alerts').select('id,tier').eq('dedupe_key', `contract-signed:${id}`);
    let pdf = false;
    if (sig?.[0]?.signed_pdf_path) {
      const dl = await db.storage.from('company-docs').download(sig[0].signed_pdf_path);
      pdf = !dl.error && (dl.data?.size ?? 0) > 1000;
    }
    Object.assign(checks, {
      contracts_signed: Boolean(a?.contracts_signed),
      signature_row: (sig?.length ?? 0) === 1,
      pdf_saved: pdf,
      pro_number: Boolean(a?.pro_number) && sig?.[0]?.pro_number === a?.pro_number,
      stage_agreement: p?.stage === 'agreement',
      gate_satisfied_event: (se ?? []).some((e: any) => e.kind === 'gate_satisfied'),
      timestamps: Boolean(a?.contracts_signed_at && a?.signing_day_signed_at && a?.contract_sent_at && p?.agreement_docs_sent_at),
      post_sign_event: ev.includes('post_sign_chain'),
      welcome_test_skip: ev.includes('welcome_t1_test_skip'),
      owner_alert: (al?.length ?? 0) === 0,
    });
    const failed = Object.entries(checks).filter(([k, v]) => k !== 'document_version' && v !== true).map(([k]) => k);
    return { case: c.key, applicant_id: id, ok: failed.length === 0, failed, checks, pro_number: a?.pro_number, template: sig?.[0]?.template_service };
  } catch (e) {
    return { case: c.key, applicant_id: id, ok: false, failed: [e instanceof Error ? e.message : String(e)], checks };
  } finally {
    if (!keep) {
      const { data: link } = await db.from('applicants').select('contractor_id').eq('id', id).maybeSingle();
      if (link?.contractor_id) await db.auth.admin.deleteUser(link.contractor_id).catch(() => {});
      const { data: sig } = await db.from('contract_signatures').select('id,signed_pdf_path').eq('applicant_id', id);
      const paths = (sig ?? []).map((x: any) => x.signed_pdf_path).filter(Boolean);
      if (paths.length) {
        await db.storage.from('company-docs').remove(paths);
        await db.from('company_documents').delete().in('storage_path', paths);
      }
      await db.from('admin_alerts').delete().eq('dedupe_key', `contract-signed:${id}`);
      await db.from('applicants').delete().eq('id', id).eq('is_test_row', true);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await isCronAuthorized(req))) {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return reply({ error: auth.error }, auth.status);
  }
  const body = await req.json().catch(() => ({}));
  const keep = body?.keep === true;
  const only = Array.isArray(body?.cases) ? body.cases : null;
  // One-time sweep of the fixture login left by the first run (fictional number only).
  const { data: ul } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of ul?.users ?? []) if (u.phone === '15555550100' || /^130555501\d\d$/.test(u.phone ?? '') && !u.email) await db.auth.admin.deleteUser(u.id).catch(() => {});
  const results = [];
  for (const c of CASES.filter((x) => only ? only.includes(x.key) : true)) results.push(await runCase(c, keep));
  const ok = results.every((r) => r.ok);
  await db.from('integration_logs').insert({ source: 'internal', event: 'signing_selftest', status: ok ? 'success' : 'error', detail: { results } });
  if (!ok) {
    const bad = results.filter((r) => !r.ok);
    await db.from('admin_alerts').upsert({
      alert_type: 'signing_selftest_failed', level: 'critical', category: 'hiring', tier: 'urgent',
      title: 'Agreement signing self-test FAILED — Pros may not be able to sign',
      body: bad.map((r) => `${r.case}: ${r.failed.join(', ')}`).join(' | '),
      context: { results }, action_url: '/admin/health',
      dedupe_key: `signing-selftest:${new Date().toISOString().slice(0, 10)}`,
    }, { onConflict: 'dedupe_key' });
  }
  return reply({ ok, results });
});
