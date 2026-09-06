// Tidy — the ONE Brevo template sender.
//
// Contract: { template_id, to, params }. Posts to Brevo's transactional
// endpoint with templateId + to + params ONLY.
//
// Hard rules:
//   - Never send htmlContent. If a caller passes HTML, reject it — the Brevo
//     template IS the design. No inline fallback, ever.
//   - A missing template ID or a missing required merge param is a named,
//     logged failure, not a degraded send.
//   - Env vars read inside the handler; whole body wrapped in try/catch;
//     failures return HTTP 200 { ok: false, error } so a failing email never
//     500s the caller.
//   - GET (or ?health=1) reports { ok, missing_env } with no side effect.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { logInvocation } from '../_shared/withLogging.ts';
import { readEnv, missingEnvError } from '../_shared/handlerEnv.ts';
import { EMAIL, emailKeyForId, missingRequiredParams } from '../_shared/emailTemplates.ts';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BREVO_API_KEY'] as const;
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const KNOWN_TEMPLATE_IDS = Object.values(EMAIL) as number[];

const RecipientSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
});

const BodySchema = z.object({
  template_id: z.number().int().positive(),
  to: z.union([
    z.string().email(),
    RecipientSchema,
    z.array(z.union([z.string().email(), RecipientSchema])).min(1),
  ]),
  params: z.record(z.string(), z.unknown()).default({}),
  sender: z.object({ name: z.string(), email: z.string().email() }).optional(),
  tags: z.array(z.string()).optional(),
  // Rejected on purpose — declared so we can return a clear error, not ignore it.
  htmlContent: z.unknown().optional(),
  html: z.unknown().optional(),
  subject: z.unknown().optional(),
});

function normalizeRecipients(to: z.infer<typeof BodySchema>['to']) {
  const list = Array.isArray(to) ? to : [to];
  return list.map((r) => (typeof r === 'string' ? { email: r } : r));
}

async function isAuthorized(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;
  if (token === serviceKey) return true;
  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.auth.getUser(token);
    const userId = data?.user?.id;
    if (error || !userId) return false;
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    return !!roleRow;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const url = new URL(req.url);
  if (req.method === 'GET' || url.searchParams.get('health') === '1') {
    const { missing } = readEnv(REQUIRED_ENV);
    return jsonResponse({
      ok: missing.length === 0,
      function: 'send-brevo-email',
      missing_env: missing,
      registered_templates: KNOWN_TEMPLATE_IDS.length,
    }, 200);
  }

  let finish: (status: 'success' | 'error' | 'warning', msg?: string | null) => Promise<void>;
  try {
    finish = await logInvocation('resend', 'send_brevo_email', { method: req.method });
  } catch {
    finish = async () => {};
  }

  try {
    if (req.method !== 'POST') {
      await finish('error', 'method_not_allowed');
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 200);
    }

    const { values, missing } = readEnv(REQUIRED_ENV);
    if (missing.length > 0) {
      const err = missingEnvError(missing);
      console.error(`[send-brevo-email] ${err}`);
      await finish('error', err);
      return jsonResponse({ ok: false, error: err, missing_env: missing }, 200);
    }

    const authorized = await isAuthorized(
      req, values.SUPABASE_URL, values.SUPABASE_SERVICE_ROLE_KEY,
    );
    if (!authorized) {
      await finish('error', 'unauthorized');
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      await finish('error', 'invalid_json_body');
      return jsonResponse({ ok: false, error: 'invalid_json_body' }, 200);
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      await finish('error', 'validation_failed');
      return jsonResponse(
        { ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
        200,
      );
    }

    const { template_id, to, params, sender, tags } = parsed.data;

    // The template is the design — refuse any caller-supplied HTML or subject.
    if (parsed.data.htmlContent !== undefined || parsed.data.html !== undefined) {
      const err = 'HTML_NOT_ALLOWED: the Brevo template is the design; pass params only';
      console.error(`[send-brevo-email] ${err}`);
      await finish('error', err);
      return jsonResponse({ ok: false, error: err }, 200);
    }
    if (parsed.data.subject !== undefined) {
      const err = 'SUBJECT_NOT_ALLOWED: the subject lives in the Brevo template';
      await finish('error', err);
      return jsonResponse({ ok: false, error: err }, 200);
    }

    // Template must be registered — no stray numeric IDs.
    const key = emailKeyForId(template_id);
    if (!key) {
      const err = `UNKNOWN_TEMPLATE_ID: ${template_id} is not in the email template registry`;
      console.error(`[send-brevo-email] ${err}`);
      await finish('error', err);
      return jsonResponse({ ok: false, error: err }, 200);
    }

    // Fail loudly rather than deliver a mail showing a raw {{ params.x }}.
    const missingParams = missingRequiredParams(template_id, params);
    if (missingParams.length > 0) {
      const err = `MISSING_PARAMS: ${key} requires ${missingParams.join(', ')}`;
      console.error(`[send-brevo-email] ${err}`);
      await finish('error', err);
      return jsonResponse({ ok: false, error: err, missing_params: missingParams }, 200);
    }

    const recipients = normalizeRecipients(to);
    const payload: Record<string, unknown> = {
      templateId: Number(template_id),
      to: recipients,
      params,
    };
    if (sender) payload.sender = sender;
    if (tags?.length) payload.tags = tags;

    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': values.BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      const err = `brevo ${res.status}: ${text.slice(0, 300)}`;
      console.error(`[send-brevo-email] send failed ${key}`, err);
      await finish('error', err);
      return jsonResponse({ ok: false, error: err, template: key, status: res.status }, 200);
    }

    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* keep raw */ }

    console.log(`[send-brevo-email] sent ${key} (template ${template_id})`);
    await finish('success');
    return jsonResponse({
      ok: true,
      template: key,
      template_id,
      message_id: (json.messageId as string) ?? null,
      recipients: recipients.length,
    }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[send-brevo-email] unhandled', message);
    await finish('error', `unhandled: ${message}`);
    return jsonResponse({ ok: false, error: message }, 200);
  }
});
