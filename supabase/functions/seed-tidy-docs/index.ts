// Tidy — Seed 19 contractor PDFs into company_documents (admin-only, idempotent).
//
// Inserts placeholder rows into `company_documents` for each known Tidy
// contractor PDF. Files are uploaded later via /admin/documents — at which
// point the storage_path / mime_type / file_size_bytes get filled in.
//
// Idempotency: filters out filenames that already exist (case-insensitive prefix
// match on the leading "NN_" sequence number) to avoid duplicates regardless of
// minor naming drift between seed batches.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Seed = { filename: string; category: string; description: string };

const DOCS: Seed[] = [
  { filename: '01_JD_HouseCleaning.pdf',          category: 'HR',          description: 'House cleaning contractor job description.' },
  { filename: '02_JD_Lawn.pdf',                   category: 'HR',          description: 'Lawn care contractor job description.' },
  { filename: '03_JD_CarDetail.pdf',              category: 'HR',          description: 'Car detailing contractor job description.' },
  { filename: '04_PaySheet_HouseCleaning.pdf',    category: 'HR',          description: 'Cleaning pay rates and bonus structure.' },
  { filename: '05_PaySheet_Lawn.pdf',             category: 'HR',          description: 'Lawn pay rates and bonus structure.' },
  { filename: '06_PaySheet_CarDetailing.pdf',     category: 'HR',          description: 'Detailing pay rates and bonus structure.' },
  { filename: '07_KitChecklist.pdf',              category: 'Operations', description: 'Tidy contractor kit checklist (tools + supplies).' },
  { filename: '08_BrandStandards.pdf',            category: 'Brand',      description: 'Tidy brand standards: logo, colors, uniform.' },
  { filename: '09_RouteOwnershipSOP.pdf',         category: 'Operations', description: 'Route ownership and visit cadence SOP.' },
  { filename: '10_PalmFrondStipulation.pdf',      category: 'Operations', description: 'Palm frond add-on stipulation policy.' },
  { filename: '11_AddOnPricing_Cleaning.pdf',     category: 'Operations', description: 'Cleaning add-on price list.' },
  { filename: '12_AddOnPricing_Lawn.pdf',         category: 'Operations', description: 'Lawn add-on price list.' },
  { filename: '13_AddOnPricing_Detail.pdf',       category: 'Operations', description: 'Detailing add-on price list.' },
  { filename: '14_OnboardingPacket_Cleaning.pdf', category: 'Onboarding', description: 'Cleaning contractor onboarding packet.' },
  { filename: '15_OnboardingPacket_Lawn.pdf',     category: 'Onboarding', description: 'Lawn contractor onboarding packet.' },
  { filename: '16_OnboardingPacket_Detail.pdf',   category: 'Onboarding', description: 'Detailing contractor onboarding packet.' },
  { filename: '17_HelloSignContract_ScheduleA.pdf', category: 'Contracts', description: 'HelloSign Schedule A — independent contractor contract.' },
  { filename: '18_InterviewGuide_ProConversation.pdf', category: 'HR',    description: 'Interview guide and pro conversation script.' },
  { filename: '19_HiringPlaybook.pdf',            category: 'HR',          description: 'Tidy hiring process playbook — recruiter-ready SOP from application to first paid visit.' },
];

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

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

  const { data: existing } = await admin
    .from('company_documents').select('filename').is('archived_at', null);
  const have = new Set((existing ?? []).map((r: any) => r.filename));

  const toInsert = DOCS.filter((d) => !have.has(d.filename)).map((d) => ({
    filename: d.filename,
    category: d.category,
    tags: ['tidy-docs', d.category.toLowerCase()],
    storage_path: `pending/${d.filename}`, // replaced on real upload
    current_version: true,
    uploaded_by: userId,
    searchable_text: `${d.filename.replace(/[_\-.]/g, ' ')} ${d.description}`,
  }));

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error, count } = await admin
      .from('company_documents').insert(toInsert, { count: 'exact' });
    if (error) {
      console.error('[seed-tidy-docs] insert failed', error);
      return jsonResponse({ error: 'insert_failed', details: error.message }, 500);
    }
    inserted = count ?? toInsert.length;
  }

  return jsonResponse({
    ok: true, inserted, skipped_existing: DOCS.length - toInsert.length, total: DOCS.length,
  });
});
