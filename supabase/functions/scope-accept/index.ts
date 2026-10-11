// Records "I've read what's included and not included" — one row per scope at
// the CURRENT version, with IP, user agent, language and surface. Rows are
// permanent (DB trigger). Reserve/checkout functions refuse without them.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { GROUP_SCOPES, SCOPE_GROUPS, isCarGroup } from '../_shared/scope.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const Body = z.object({
  ref: z.string().trim().min(16).max(80),
  email: z.string().trim().email().max(200).optional(),
  groups: z.array(z.enum(SCOPE_GROUPS)).min(1).max(4),
  language: z.enum(['en', 'es']).default('en'),
  surface: z.enum(['founding', 'quote', 'checkout', 'upgrade']),
  water_consent: z.boolean().optional(),
  checkbox_text: z.record(z.string().max(400)),
});

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  const limited = await enforceRateLimit(req, { bucket: 'scope-accept', limit: 40, windowSeconds: 3600 });
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body' }, 400);
  const b = parsed.data;

  let uid: string | null = null; let userEmail: string | null = null;
  const bt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (bt) { const { data } = await admin.auth.getUser(bt); uid = data?.user?.id ?? null; userEmail = data?.user?.email ?? null; }
  const email = (b.email ?? userEmail ?? '').toLowerCase() || null;
  if (!email && !uid) return jsonResponse({ ok: false, error: 'email_required' }, 400);
  if (b.groups.some(isCarGroup) && b.water_consent !== true) return jsonResponse({ ok: false, error: 'water_consent_required' }, 400);

  const { data: versions } = await admin.from('scope_versions').select('service, scope_version');
  const current = new Map<string, number>();
  for (const v of versions ?? []) current.set(v.service, Math.max(current.get(v.service) ?? 0, v.scope_version));
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip'));
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 500);

  const rows = b.groups.flatMap((g) => {
    const text = b.checkbox_text[g];
    return GROUP_SCOPES[g].map((service) => ({
      customer_id: uid, email, acceptance_ref: b.ref, service, scope_version: current.get(service) ?? 1,
      ip, user_agent: ua, language: b.language, surface: b.surface,
      water_consent: isCarGroup(g) ? true : null, checkbox_text: (text ?? '').slice(0, 400) || g,
    }));
  });
  const { error } = await admin.from('scope_acceptances').insert(rows);
  if (error) { console.error('[scope-accept] insert', error.message); return jsonResponse({ ok: false, error: 'insert_failed' }, 500); }
  return jsonResponse({ ok: true, ref: b.ref, accepted: rows.map((r) => ({ service: r.service, scope_version: r.scope_version })) });
});
