// Tidy — Equipment photo review (Phase 3, admin only).
// POST { photo_id, decision: 'approved'|'rejected', reason?, notes? }
// On every decision, recomputes whether the applicant has at least one
// 'approved' photo for every required equipment item; if so, flips
// applicants.equipment_approved = true.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Mirror of src/lib/equipmentChecklist required-item sets.
const HOUSE = ['vacuum_cleaner', 'mop_and_bucket', 'supply_kit', 'uniform_or_attire'];
const LAWN = ['mower', 'edger', 'blower', 'trimmer', 'vehicle_and_trailer'];
// NOTE: 'pressure_washer' is OPTIONAL and deliberately not in this list — it
// never gates equipment_approved. Missing/unapproved => wash_only = true.
const DETAIL = ['hose_nozzle_buckets', 'shop_vac_or_wet_dry_vac', 'polishing_supplies', 'microfiber_supply', 'vehicle'];
const PRESSURE_WASHER_KEY = 'pressure_washer';

function isDetailService(service: string | null): boolean {
  const s = (service ?? '').toLowerCase();
  return s.includes('detail') || s.includes('car') || s.includes('bundle') || s.includes('all');
}

function requiredFor(service: string | null): string[] {
  const s = (service ?? '').toLowerCase();
  const set = new Set<string>();
  const add = (arr: string[]) => arr.forEach((k) => set.add(k));
  if (!s) { add(HOUSE); return Array.from(set); }
  if (s.includes('bundle') || s.includes('all')) { add(HOUSE); add(LAWN); add(DETAIL); return Array.from(set); }
  if (s.includes('clean')) add(HOUSE);
  if (s.includes('lawn')) add(LAWN);
  if (s.includes('detail') || s.includes('car')) add(DETAIL);
  if (set.size === 0) add(HOUSE);
  return Array.from(set);
}


const Body = z.object({
  photo_id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: roleRow } = await admin.from('user_roles')
      .select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) return jsonResponse({ error: 'forbidden' }, 403);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
    const { photo_id, decision, reason, notes } = parsed.data;

    const noteText = [reason, notes].filter(Boolean).join(' — ') || null;

    const { data: photo, error: pErr } = await admin
      .from('applicant_equipment_photos')
      .update({
        status: decision,
        notes: noteText,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', photo_id)
      .select('id, applicant_id, photo_type')
      .single();
    if (pErr || !photo) return jsonResponse({ error: 'photo_not_found', details: pErr?.message }, 404);

    // Recompute equipment_approved for this applicant.
    const { data: applicant } = await admin.from('applicants')
      .select('id, service, equipment_approved, wash_only').eq('id', photo.applicant_id).single();
    if (!applicant) return jsonResponse({ ok: true, recomputed: false });

    const required = requiredFor(applicant.service);
    const { data: approvedPhotos } = await admin
      .from('applicant_equipment_photos')
      .select('photo_type')
      .eq('applicant_id', applicant.id)
      .eq('status', 'approved');
    const approvedTypes = new Set((approvedPhotos ?? []).map((p) => p.photo_type));
    const allApproved = required.every((k) => approvedTypes.has(k));

    // Detail Pros without an approved pressure-washer photo are wash-only:
    // approvable, but not eligible for full Detail jobs.
    const washOnly = isDetailService(applicant.service)
      ? !approvedTypes.has(PRESSURE_WASHER_KEY)
      : false;

    const patch: Record<string, unknown> = {};
    if (allApproved !== applicant.equipment_approved) patch.equipment_approved = allApproved;
    if (washOnly !== applicant.wash_only) patch.wash_only = washOnly;

    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      await admin.from('applicants').update(patch).eq('id', applicant.id);
      if ('equipment_approved' in patch) {
        await admin.from('onboarding_events').insert({
          applicant_id: applicant.id,
          event: allApproved ? 'equipment_approved' : 'equipment_unapproved',
          metadata: { required, approved: Array.from(approvedTypes), wash_only: washOnly },
        });
      }
      if ('wash_only' in patch) {
        await admin.from('onboarding_events').insert({
          applicant_id: applicant.id,
          event: washOnly ? 'flagged_wash_only' : 'cleared_wash_only',
          metadata: { reason: 'pressure_washer photo (optional item)' },
        });
      }
    }

    return jsonResponse({
      ok: true,
      equipment_approved: allApproved,
      wash_only: washOnly,
      required,
      optional: [PRESSURE_WASHER_KEY],
      approved: Array.from(approvedTypes),
    });

  } catch (e) {
    console.error('[equipment-photo-review]', e);
    return jsonResponse({ error: 'internal_error', message: String(e) }, 500);
  }
});
