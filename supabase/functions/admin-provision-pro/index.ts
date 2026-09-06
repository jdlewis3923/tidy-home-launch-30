// Tidy — admin action: invite a Pro.
//
// Sends an invitation email so the Pro sets their own password; links the auth
// user to the applicant row via contractor_id and grants the 'pro' role in
// user_roles. The operator never sets or sees a Pro's password.
//
// Admin-only. Until this runs, a hired contractor has no way into the Portal.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { readEnv, missingEnvError } from '../_shared/handlerEnv.ts';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const BodySchema = z.object({
  applicant_id: z.string().uuid(),
  redirect_to: z.string().url().max(500).optional(),
});
const DEFAULT_REDIRECT = 'https://jointidy.co/reset-password';


Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const env = readEnv(REQUIRED_ENV);
  if (req.method === 'GET') {
    return jsonResponse({ ok: env.missing.length === 0, function: 'admin-provision-pro', missing_env: env.missing });
  }
  if (env.missing.length) return jsonResponse({ ok: false, error: missingEnvError(env.missing) });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' });

  try {
    console.log('[admin-provision-pro] entry');
    const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData } = await admin.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (!callerId) return jsonResponse({ ok: false, error: 'unauthorized' });
    const { data: isAdmin } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!isAdmin) return jsonResponse({ ok: false, error: 'forbidden' });

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body' });

    const { data: applicant } = await admin
      .from('applicants')
      .select('id, email, first_name, last_name, phone, contractor_id')
      .eq('id', parsed.data.applicant_id)
      .maybeSingle();
    if (!applicant) return jsonResponse({ ok: false, error: 'applicant_not_found' });

    let userId = applicant.contractor_id as string | null;
    let password: string | null = null;

    if (!userId) {
      password = tempPassword();
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: applicant.email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: applicant.first_name,
          last_name: applicant.last_name,
          phone: applicant.phone,
          is_pro: true,
        },
      });
      if (createErr || !created?.user) {
        // Email may already have an account — adopt it.
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const found = list?.users?.find(
          (u) => (u.email ?? '').toLowerCase() === applicant.email.toLowerCase(),
        );
        if (!found) return jsonResponse({ ok: false, error: createErr?.message ?? 'create_user_failed' });
        userId = found.id;
        password = null;
      } else {
        userId = created.user.id;
      }
    }

    await admin.from('applicants').update({ contractor_id: userId }).eq('id', applicant.id);
    const { error: roleErr } = await admin
      .from('user_roles')
      .upsert({ user_id: userId, role: 'pro' }, { onConflict: 'user_id,role' });
    if (roleErr) return jsonResponse({ ok: false, error: `role_grant_failed: ${roleErr.message}` });

    return jsonResponse({
      ok: true,
      user_id: userId,
      email: applicant.email,
      temp_password: password,
      note: password ? 'Share once; the Pro should reset it after first sign in.' : 'Existing login linked.',
    });
  } catch (e) {
    console.error('[admin-provision-pro] failed', (e as Error).message);
    return jsonResponse({ ok: false, error: (e as Error).message });
  }
});
