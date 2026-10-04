import '../_shared/http.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
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
  if (!(await isCronAuthorized(req))) {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  }

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
      if (new URL(req.url).searchParams.get('scan') === 'pay') {
        // Read-only: surface any car-care pay figure that is not canon (16/20/26 · 78/88/115).
        const text = current.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        const hits = [...text.matchAll(/.{0,70}\$(?:17|27|51|61|82)\b.{0,70}/g)].map((m) => m[0]);
        results.push({ id, name: template.name ?? null, ok: true, hits });
        continue;
      }
      if (new URL(req.url).searchParams.get('scan') === 'text') {
        // Read-only: surface the first occurrence of a phrase in each template.
        const q = (new URL(req.url).searchParams.get('q') ?? '').toLowerCase();
        const text = current.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        const idx = q ? text.toLowerCase().indexOf(q) : -1;
        results.push({ id, name: template.name ?? null, ok: true, found: idx >= 0, excerpt: idx >= 0 ? text.slice(Math.max(0, idx - 60), idx + 140) : null });
        continue;
      }
      if (new URL(req.url).searchParams.get('scan') === 'replace') {
        // Write mode: plain-text replace of an exact phrase in each template's HTML.
        const q = new URL(req.url).searchParams.get('q') ?? '';
        const r = new URL(req.url).searchParams.get('r') ?? '';
        if (q && r && current.includes(q)) {
          const write = await vendorFetch(`${GATEWAY}/${id}`, {
            method: 'PUT', headers: h, body: JSON.stringify({ htmlContent: current.split(q).join(r) }),
          });
          results.push({ id, name: template.name ?? null, ok: write.ok, stage: 'replace', status: write.status, replaced: write.ok });
          continue;
        }
        results.push({ id, name: template.name ?? null, ok: true, replaced: false });
        continue;
      }
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
