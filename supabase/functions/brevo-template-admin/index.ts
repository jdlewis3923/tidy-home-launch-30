import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — read and update a Brevo transactional template.
 *
 * Brevo's API is IP-allowlisted, so template edits have to leave from the
 * edge-function runtime rather than any local tool. Admin or service-role only.
 *
 *   GET  ?id=64                       → the live template (subject + html)
 *   POST { id, subject?, htmlContent?, name?, isActive? } → update in place
 *   POST { id, test_to }              → send that template to one address
 */
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { vendorFetch } from '../_shared/http.ts';

const BREVO = 'https://api.brevo.com/v3/smtp';

const Body = z.object({
  id: z.number().int().positive(),
  subject: z.string().min(1).max(300).optional(),
  htmlContent: z.string().min(1).max(400000).optional(),
  name: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  test_to: z.string().email().optional(),
  params: z.record(z.unknown()).optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  if (!apiKey) return jsonResponse({ error: 'BREVO_API_KEY not configured' }, 503);
  const headers = { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' };

  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id') ?? '';
    if (!/^\d+$/.test(id)) return jsonResponse({ error: 'id required' }, 400);
    const res = await vendorFetch(`${BREVO}/templates/${id}`, { headers });
    const text = await res.text();
    if (!res.ok) return jsonResponse({ error: 'brevo_error', status: res.status, body: text.slice(0, 600) }, res.status);
    return jsonResponse({ ok: true, template: JSON.parse(text) });
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { id, test_to, params, ...patch } = parsed.data;

  if (test_to) {
    const res = await vendorFetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: [{ email: test_to }], templateId: id, params: params ?? {} }),
    });
    const body = await res.text();
    if (!res.ok) return jsonResponse({ error: 'brevo_error', status: res.status, body: body.slice(0, 600) }, res.status);
    return jsonResponse({ ok: true, sent_to: test_to, brevo: body ? JSON.parse(body) : null });
  }

  if (!Object.keys(patch).length) return jsonResponse({ error: 'nothing_to_update' }, 400);

  const res = await vendorFetch(`${BREVO}/templates/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.text();
    return jsonResponse({ error: 'brevo_error', status: res.status, body: body.slice(0, 600) }, res.status);
  }
  return jsonResponse({ ok: true, updated: id, fields: Object.keys(patch) });
});
