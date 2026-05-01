// Tidy — Seed company_documents (admin only, idempotent)
//
// Inserts placeholder rows for every known Tidy company document so
// /admin/documents is non-empty on first load. Files themselves are
// uploaded later via the page's Upload modal — at which point the
// existing row's storage_path / mime_type / file_size_bytes get filled.
//
// Idempotent: existing rows with the same filename are left alone.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type SeedRow = { filename: string; category: string; tags?: string[] };

const ONBOARDING: SeedRow[] = [
  '01_JD_HouseCleaning.pdf', '02_JD_LawnCare.pdf', '03_JD_CarDetailing.pdf',
  '04_PaySheet_HouseCleaning.pdf', '05_PaySheet_LawnCare.pdf', '06_PaySheet_CarDetailing.pdf',
  '07_Handbook_HouseCleaning.pdf', '08_Handbook_LawnCare.pdf', '09_Handbook_CarDetailing.pdf',
  '10_ICA_IndependentContractorAgreement.pdf', '11_OfferLetter_Template.pdf',
  '12_OnboardingPacket_Cleaning.pdf', '13_OnboardingPacket_Lawn.pdf', '14_OnboardingPacket_Detail.pdf',
  '15_Contract_Cleaning.pdf', '16_Contract_Lawn.pdf', '17_Contract_Detail.pdf',
  '18_InterviewGuide.pdf',
].map((f) => ({ filename: f, category: 'Contractor Onboarding', tags: ['contractor'] }));

const EMAILS: SeedRow[] = [
  { filename: 'welcome_email_cleaning.html', category: 'Email Templates', tags: ['welcome', 'cleaning'] },
  { filename: 'welcome_email_lawn.html', category: 'Email Templates', tags: ['welcome', 'lawn'] },
  { filename: 'welcome_email_detail.html', category: 'Email Templates', tags: ['welcome', 'detail'] },
];

const FINANCIAL: SeedRow[] = [
  'TIDY_FINANCIAL_PLAN.md', 'TIDY_BUSINESS_PLAN.pptx',
  'TIDY_KPI_DICTIONARY.md', 'TIDY_PERKS_SETUP_PLAYBOOK.md',
].map((f) => ({ filename: f, category: 'Financial + Strategy', tags: ['strategy'] }));

const OPERATIONAL: SeedRow[] = [
  'TIDY_ADDON_BACKEND_CONNECTION.md', 'TIDY_HIRING_BACKEND_SPEC.md',
  'TIDY_LOVABLE_PROMPT_ADDON_ATTACH.md', 'TIDY_HR_DOCS_REFERENCE_PAGE_SPEC.md',
].map((f) => ({ filename: f, category: 'Operational', tags: ['ops'] }));

const BRAND: SeedRow[] = [
  { filename: 'tidy-logo.png', category: 'Brand Assets', tags: ['brand'] },
  { filename: 'tidy-contractor-kit.png', category: 'Brand Assets', tags: ['brand'] },
];

const ALL: SeedRow[] = [...ONBOARDING, ...EMAILS, ...FINANCIAL, ...OPERATIONAL, ...BRAND];

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  // AuthN: signed-in admin only.
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

  // Existing filenames to skip
  const { data: existing } = await admin
    .from('company_documents').select('filename').is('archived_at', null);
  const have = new Set((existing ?? []).map((r: any) => r.filename));

  const toInsert = ALL.filter((r) => !have.has(r.filename)).map((r) => ({
    filename: r.filename,
    category: r.category,
    tags: r.tags ?? [],
    storage_path: `pending/${r.filename}`, // placeholder until real upload
    current_version: true,
    uploaded_by: userId,
    searchable_text: r.filename.replace(/[_\\-.]/g, ' '),
  }));

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error, count } = await admin
      .from('company_documents').insert(toInsert, { count: 'exact' });
    if (error) {
      console.error('[seed] insert failed', error);
      return jsonResponse({ error: 'insert_failed', details: error.message }, 500);
    }
    inserted = count ?? toInsert.length;
  }

  return jsonResponse({
    ok: true,
    inserted,
    skipped_existing: ALL.length - toInsert.length,
    total_known: ALL.length,
  });
});
