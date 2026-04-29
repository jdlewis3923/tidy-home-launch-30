// Tidy — Sync Applicant to Master Google Sheet (via Zapier Catch Hook)
//
// POST { applicant_id: uuid, last_event?: string, last_event_at?: string }
//
// Reads Supabase secret ZAPIER_APPLICANTS_WEBHOOK_URL. If not set, logs a
// "skipped — webhook URL missing" message and returns 200 so callers (the
// applicant-applied-trigger and advance-applicant edge functions) don't block.
//
// Payload column order matches the "Applicants" tab in the Tidy Master sheet:
// ApplicantID | FirstName | LastName | Email | Phone | Role | ZIP |
// ExperienceYears | HasVehicle | HasSupplies | Status | BGStatus | BGNotes |
// AppliedAt | UpdatedAt | LastEvent | LastEventAt | NotesURL

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// TODO: set ZAPIER_APPLICANTS_WEBHOOK_URL in Supabase secrets to the Zapier
// "Catch Hook" URL that writes to the Tidy Master sheet's Applicants tab.
const ZAPIER_URL = Deno.env.get('ZAPIER_APPLICANTS_WEBHOOK_URL') ?? '';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const Body = z.object({
  applicant_id: z.string().uuid(),
  last_event: z.string().optional(),
  last_event_at: z.string().optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return jsonResponse({ error: 'invalid_body' }, 400);

  if (!ZAPIER_URL) {
    console.warn('[sync-applicant-to-sheet] skipped — webhook URL missing');
    return jsonResponse({ ok: true, skipped: 'webhook URL missing' });
  }

  const { data: a, error } = await admin
    .from('applicants')
    .select('*')
    .eq('id', parsed.data.applicant_id)
    .single();
  if (error || !a) return jsonResponse({ error: 'not_found' }, 404);

  // Service → canonical role bucket.
  const svc = (a.service ?? '').toLowerCase();
  const role = svc.includes('lawn') ? 'lawn'
    : (svc.includes('detail') || svc.includes('car')) ? 'detail'
    : 'cleaning';

  const lastEventAt = parsed.data.last_event_at ?? a.updated_at ?? a.stage_entered_at ?? a.created_at;
  const lastEvent = parsed.data.last_event ?? a.current_stage ?? 'applied';

  // Column-ordered payload (object keys match the Sheet header names exactly).
  const payload = {
    ApplicantID:     a.id,
    FirstName:       a.first_name ?? '',
    LastName:        a.last_name ?? '',
    Email:           a.email ?? '',
    Phone:           a.phone ?? '',
    Role:            role,
    ZIP:             a.zip ?? '',
    ExperienceYears: a.experience_years ?? '',
    HasVehicle:      a.has_vehicle ?? '',
    HasSupplies:     a.has_supplies ?? '',
    Status:          a.current_stage ?? a.status ?? 'applied',
    BGStatus:        a.bg_check_status ?? '',
    BGNotes:         a.bg_check_notes ?? '',
    AppliedAt:       a.created_at ?? '',
    UpdatedAt:       a.updated_at ?? a.stage_entered_at ?? a.created_at ?? '',
    LastEvent:       lastEvent,
    LastEventAt:     lastEventAt,
    NotesURL:        `https://jointidy.co/admin/applicants/${a.id}`,
  };

  try {
    const res = await fetch(ZAPIER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[sync-applicant-to-sheet] zap responded', res.status, txt);
      return jsonResponse({ ok: false, status: res.status }, 502);
    }
  } catch (e) {
    console.error('[sync-applicant-to-sheet] fetch failed', e);
    return jsonResponse({ ok: false, error: String(e) }, 502);
  }

  return jsonResponse({ ok: true, applicant_id: a.id, last_event: lastEvent });
});
