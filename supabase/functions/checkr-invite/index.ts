import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — Checkr invitation dispatcher
//
// POST { applicant_id: uuid, resend?: boolean }
// - Loads the applicant (/apply record)
// - Creates a Checkr Candidate from first name, last name, email, phone, ZIP
// - Creates an Invitation with the package held in CHECKR_PACKAGE, so Checkr
//   emails the candidate and collects SSN / date of birth / driver's licence
//   itself. Tidy never sees, logs or stores any of those.
// - Persists ONLY: candidate id, invitation id, report status and timestamps.
//
// Secrets are read at handler scope (never module scope) and never logged.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { vendorFetch } from '../_shared/http.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { logIntegrationEvent } from '../_shared/integration-log.ts';
import { readEnv, readOptionalEnv } from '../_shared/handlerEnv.ts';

const CHECKR_BASE = 'https://api.checkr.com/v1';

const Body = z.object({
  applicant_id: z.string().uuid(),
  resend: z.boolean().optional(),
});

function basicAuth(apiKey: string): string {
  // Checkr uses HTTP Basic with the API key as username, blank password.
  return 'Basic ' + btoa(`${apiKey}:`);
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  // Admin session or service-role only — never open to the browser anon key.
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  const env = readEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const);
  if (env.missing.length) return jsonResponse({ error: `MISSING_ENV: ${env.missing.join(', ')}` }, 500);

  const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { applicant_id, resend } = parsed.data;

  const { data: applicant, error: fetchErr } = await admin
    .from('applicants')
    .select('id, first_name, last_name, email, phone, zip, checkr_candidate_id, checkr_invitation_id')
    .eq('id', applicant_id)
    .maybeSingle();
  if (fetchErr || !applicant) return jsonResponse({ error: 'applicant_not_found' }, 404);

  const apiKey = readOptionalEnv('CHECKR_API_KEY') ?? '';
  const pkg = readOptionalEnv('CHECKR_PACKAGE') ?? '';

  if (!apiKey || !pkg) {
    const missing = [!apiKey ? 'CHECKR_API_KEY' : null, !pkg ? 'CHECKR_PACKAGE' : null].filter(Boolean);
    console.warn('[checkr-invite] not configured — skipping API call', missing.join(', '));
    await admin.from('onboarding_events').insert({
      applicant_id,
      event: 'checkr_invite_skipped',
      metadata: { reason: `not configured: ${missing.join(', ')}` },
    });
    await logIntegrationEvent({
      source: 'checkr',
      event: 'invitation_skipped',
      status: 'warning',
      error_message: `not configured: ${missing.join(', ')}`,
    });
    return jsonResponse({ ok: false, skipped: true, error: `not configured: ${missing.join(', ')}` }, 200);
  }

  const startedAt = Date.now();
  try {
    // 1) Create candidate (or reuse existing)
    let candidateId = applicant.checkr_candidate_id ?? null;
    if (!candidateId) {
      const candRes = await vendorFetch(`${CHECKR_BASE}/candidates`, {
        method: 'POST',
        headers: {
          Authorization: basicAuth(apiKey),
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
        console.error('[checkr-invite] candidate create failed', candRes.status);
        await logIntegrationEvent({
          source: 'checkr', event: 'candidate_create', status: 'error',
          latency_ms: Date.now() - startedAt, error_message: `${candRes.status}: ${txt.slice(0, 300)}`,
        });
        return jsonResponse({ error: 'checkr_candidate_failed', status: candRes.status, body: txt.slice(0, 500) }, 502);
      }
      const candJson = await candRes.json();
      candidateId = candJson.id;
      await logIntegrationEvent({
        source: 'checkr', event: 'candidate_create', status: 'success',
        latency_ms: Date.now() - startedAt,
      });
    }

    // 2) Create invitation (a fresh one on resend — Checkr emails again)
    const invStarted = Date.now();
    const invRes = await vendorFetch(`${CHECKR_BASE}/invitations`, {
      method: 'POST',
      headers: {
        Authorization: basicAuth(apiKey),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        candidate_id: candidateId!,
        package: pkg,
      }),
    });
    if (!invRes.ok) {
      const txt = await invRes.text().catch(() => '');
      console.error('[checkr-invite] invitation create failed', invRes.status);
      await logIntegrationEvent({
        source: 'checkr', event: resend ? 'invitation_resend' : 'invitation_create', status: 'error',
        latency_ms: Date.now() - invStarted, error_message: `${invRes.status}: ${txt.slice(0, 300)}`,
      });
      return jsonResponse({ error: 'checkr_invitation_failed', status: invRes.status, body: txt.slice(0, 500) }, 502);
    }
    const invJson = await invRes.json();

    const orderedAt = new Date().toISOString();
    await admin.from('applicants').update({
      checkr_candidate_id: candidateId,
      checkr_invitation_id: invJson.id,
      bg_check_provider: 'checkr',
      bg_check_status: 'pending',
      checkr_report_status: 'invitation_pending',
      bg_check_ordered_at: orderedAt,
      bg_check_manual_review: false,
      updated_at: orderedAt,
    }).eq('id', applicant_id);

    await admin.from('onboarding_events').insert({
      applicant_id,
      event: resend ? 'checkr_invitation_resent' : 'checkr_invitation_sent',
      metadata: { candidate_id: candidateId, invitation_id: invJson.id },
    });

    await logIntegrationEvent({
      source: 'checkr', event: resend ? 'invitation_resend' : 'invitation_create', status: 'success',
      latency_ms: Date.now() - invStarted,
    });

    return jsonResponse({
      ok: true,
      resent: !!resend,
      candidate_id: candidateId,
      invitation_id: invJson.id,
      invitation_url: invJson.invitation_url ?? null,
      ordered_at: orderedAt,
    });
  } catch (e) {
    console.error('[checkr-invite] error', (e as Error).message);
    await logIntegrationEvent({
      source: 'checkr', event: 'invitation_create', status: 'error',
      latency_ms: Date.now() - startedAt, error_message: (e as Error).message,
    });
    return jsonResponse({ error: 'checkr_invite_exception', message: String(e) }, 500);
  }
});
