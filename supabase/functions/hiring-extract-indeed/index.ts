import '../_shared/http.ts';
/**
 * hiring-extract-indeed — turn a pasted Indeed candidate page into structured
 * applicant fields. Extraction only: this function never writes an applicant
 * row. The admin confirms or edits the fields first, then saves.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';

const SYSTEM = `You extract hiring data from a pasted Indeed candidate page for a
Miami home-services company (house cleaning, lawn care, car care).

Return ONLY JSON matching this shape:
{
  "name": string|null,
  "phone": string|null,
  "city_or_zip": string|null,
  "applied_on": "YYYY-MM-DD"|null,
  "service": "cleaning"|"lawn"|"car_care"|null,
  "years_in_service": number|null,
  "owner_operator": boolean|null,
  "has_insurance": boolean|null,
  "trade_job_current": boolean|null,
  "experience_matches_resume": "yes"|"no"|"unknown",
  "bilingual": "yes"|"no"|"unknown",
  "drivers_license": "yes"|"no"|"unknown",
  "work_authorized": "yes"|"no"|"unknown",
  "own_equipment": "yes"|"no"|"unknown",
  "background_check_ok": "yes"|"no"|"unknown",
  "reads_texts": "yes"|"no"|"unknown",
  "why": string|null,
  "watch_for": string|null,
  "notes": string|null
}

Rules:
- bilingual is "yes" only when BOTH English and Spanish are answered yes.
- Map the screener answers: language -> bilingual, driver's licence -> drivers_license,
  work authorization -> work_authorized, "read and reply to text messages" -> reads_texts,
  equipment/supplies -> own_equipment, background check -> background_check_ok,
  insurance -> has_insurance.
- years_in_service = years in THIS trade only.
- trade_job_current = true when a listed job is in this trade.
- owner_operator = true when a listed job is self-employed, owner, or an LLC in this trade.
- experience_matches_resume = "no" when the claimed years are not supported by the listed jobs.
- Anything not stated is null or "unknown". Never guess.
- "why" is one short line on why they are worth a call. "watch_for" is one short concern.
- Never extract or invent a social security number, date of birth, or licence number.`;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let text = '';
  let service: string | null = null;
  try {
    const body = await req.json();
    text = String(body?.text ?? '').slice(0, 24_000);
    service = body?.service ? String(body.service) : null;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (text.trim().length < 20) {
    return new Response(JSON.stringify({ ok: false, error: 'paste_too_short' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) {
    return new Response(JSON.stringify({ ok: false, error: 'ai_not_configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const started = Date.now();
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: service
            ? `The opening is for service "${service}".\n\n${text}`
            : text,
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  const raw = await resp.text();
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
  await admin.from('integration_logs').insert({
    source: 'openai',
    event: 'hiring_extract_indeed',
    status: resp.ok ? 'success' : 'error',
    latency_ms: Date.now() - started,
    detail: resp.ok ? null : raw.slice(0, 500),
  }).then(() => {}, () => {});

  if (!resp.ok) {
    console.error(`AI extract failed [${resp.status}]: ${raw.slice(0, 400)}`);
    return new Response(
      JSON.stringify({ ok: false, error: 'ai_request_failed', status: resp.status, details: raw.slice(0, 400) }),
      { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let fields: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    fields = JSON.parse(parsed?.choices?.[0]?.message?.content ?? '{}');
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'ai_bad_response' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Defensive: never let sensitive identifiers through, even if a paste had them.
  for (const banned of ['ssn', 'social_security', 'date_of_birth', 'dob', 'license_number']) {
    delete (fields as Record<string, unknown>)[banned];
  }

  return new Response(JSON.stringify({ ok: true, fields }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
