import '../_shared/http.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { EMAIL } from '../_shared/emailTemplates.ts';
import { brandHostedTemplate } from '../_shared/email-brand.ts';
import { vendorFetch } from '../_shared/http.ts';

const GATEWAY = 'https://connector-gateway.lovable.dev/brevo/smtp/templates';

type LiveTemplate = { id: number; name?: string; subject?: string; htmlContent?: string };

function headers(): Record<string, string> | null {
  const lovable = Deno.env.get('LOVABLE_API_KEY');
  const brevo = Deno.env.get('BREVO_API_KEY');
  if (!lovable || !brevo) return null;
  return {
    Authorization: `Bearer ${lovable}`,
    'X-Connection-Api-Key': brevo,
    'Content-Type': 'application/json',
    accept: 'application/json',
  };
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  const h = headers();
  if (!h) return jsonResponse({ error: 'email_connection_not_configured' }, 503);
  const apply = req.method === 'POST';
  if (!apply && req.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const ids = [...new Set(Object.values(EMAIL))].sort((a, b) => a - b);
  const results: Array<Record<string, unknown>> = [];
  for (const id of ids) {
    try {
      const read = await vendorFetch(`${GATEWAY}/${id}`, { headers: h });
      if (!read.ok) {
        results.push({ id, ok: false, stage: 'read', status: read.status });
        continue;
      }
      const template = await read.json() as LiveTemplate;
      const current = template.htmlContent ?? '';
      const branded = brandHostedTemplate(current, template.subject ?? template.name ?? 'A Tidy update');
      if (apply && branded.changed) {
        const write = await vendorFetch(`${GATEWAY}/${id}`, {
          method: 'PUT', headers: h, body: JSON.stringify({ htmlContent: branded.html }),
        });
        if (!write.ok) {
          results.push({ id, name: template.name ?? null, ok: false, stage: 'write', status: write.status });
          continue;
        }
      }
      results.push({ id, name: template.name ?? null, ok: true, changed: branded.changed, mode: branded.mode, applied: apply && branded.changed });
    } catch (error) {
      results.push({ id, ok: false, stage: 'network', error: error instanceof Error ? error.message : 'unknown' });
    }
  }

  return jsonResponse({
    ok: results.every((row) => row.ok === true),
    applied: apply,
    total: ids.length,
    changed: results.filter((row) => row.changed === true).length,
    failed: results.filter((row) => row.ok !== true).length,
    results,
  }, 200);
});