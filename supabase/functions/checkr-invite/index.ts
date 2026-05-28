// Tidy — Checkr invitation dispatcher
//
// POST { applicant_id: uuid }
// - Loads the applicant
// - Calls Checkr API to create candidate + invitation (Basic+ package)
// - Persists checkr_candidate_id / checkr_invitation_id / bg_check_provider
// - Gracefully no-ops with a clear error when CHECKR_API_KEY is unset, so the
//   rest of the pipeline (stage transitions, applicant email) keeps working
//   while we wait for Checkr developer-access approval.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHECKR_API_KEY = Deno.env.get('CHECKR_API_KEY') ?? '';
const CHECKR_PACKAGE = Deno.env.get('CHECKR_PACKAGE') ?? 'tasker_pro'; // Basic+ equivalent
const CHECKR_BASE = 'https://api.checkr.com/v1';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const Body = z.object({ applicant_id: z.string().uuid() });

function basicAuth(apiKey: string): string {
  // Checkr uses HTTP Basic with the API key as username, blank password.
  return 'Basic ' + btoa(`${apiKey}:`);
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { applicant_id } = parsed.data;

  const { data: applicant, error: fetchErr } = await admin
    .from('applicants')
    .select('id, first_name, last_name, email, phone, zip, checkr_candidate_id, checkr_invitation_id')
    .eq('id', applicant_id)
    .maybeSingle();
  if (fetchErr || !applicant) return jsonResponse({ error: 'applicant_not_found' }, 404);

  if (!CHECKR_API_KEY) {
    console.warn('[checkr-invite] CHECKR_API_KEY not configured — skipping API call');
    await admin.from('onboarding_events').insert({
      applicant_id,
      event: 'checkr_invite_skipped',
      metadata: { reason: 'CHECKR_API_KEY not configured' },
    });
    return jsonResponse({
      ok: false,
      skipped: true,
      error: 'CHECKR_API_KEY not configured',
    }, 200);
  }

  try {
    // 1) Create candidate (or reuse existing)
    let candidateId = applicant.checkr_candidate_id ?? null;
    if (!candidateId) {
      const candRes = await fetch(`${CHECKR_BASE}/candidates`, {
        method: 'POST',
        headers: {
          Authorization: basicAuth(CHECKR_API_KEY),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          first_name: applicant.first_name,
          last_name: applicant.last_name,
          email: applicant.email,
          ...(applicant.phone ? { phone: applicant.phone } : {}),
          ...(applicant.zip ? { zipcode: applicant.zip } : {}),
          work_locations: JSON.stringify([{ country: 'US', state: 'FL', city: 'Miami' }]),
        }),
      });
      if (!candRes.ok) {
        const txt = await candRes.text().catch(() => '');
        console.error('[checkr-invite] candidate create failed', candRes.status, txt);
        return jsonResponse({ error: 'checkr_candidate_failed', status: candRes.status, body: txt }, 502);
      }
      const candJson = await candRes.json();
      candidateId = candJson.id;
    }

    // 2) Create invitation
    const invRes = await fetch(`${CHECKR_BASE}/invitations`, {
      method: 'POST',
      headers: {
        Authorization: basicAuth(CHECKR_API_KEY),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        candidate_id: candidateId!,
        package: CHECKR_PACKAGE,
      }),
    });
    if (!invRes.ok) {
      const txt = await invRes.text().catch(() => '');
      console.error('[checkr-invite] invitation create failed', invRes.status, txt);
      return jsonResponse({ error: 'checkr_invitation_failed', status: invRes.status, body: txt }, 502);
    }
    const invJson = await invRes.json();

    await admin.from('applicants').update({
      checkr_candidate_id: candidateId,
      checkr_invitation_id: invJson.id,
      bg_check_provider: 'checkr',
      bg_check_status: 'pending',
      updated_at: new Date().toISOString(),
    }).eq('id', applicant_id);

    await admin.from('onboarding_events').insert({
      applicant_id,
      event: 'checkr_invitation_sent',
      metadata: { candidate_id: candidateId, invitation_id: invJson.id, package: CHECKR_PACKAGE },
    });

    return jsonResponse({
      ok: true,
      candidate_id: candidateId,
      invitation_id: invJson.id,
      invitation_url: invJson.invitation_url ?? null,
    });
  } catch (e) {
    console.error('[checkr-invite] error', e);
    return jsonResponse({ error: 'checkr_invite_exception', message: String(e) }, 500);
  }
});
