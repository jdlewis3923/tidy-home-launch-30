// Tidy — Jobber customer sync.
//
// Service-role only. Given a Tidy user_id, upserts the corresponding
// Jobber Client and stores the resulting jobber_client_id back onto the
// user's most recent active subscription row.
//
// Idempotent: if the subscription already has jobber_client_id set, we
// short-circuit and return ok with reused=true.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';
import { jobberGraphQL } from '../_shared/jobber-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  user_id: z.string().uuid(),
  subscription_id: z.string().uuid().optional(),
});

const CLIENT_CREATE = `
  mutation ClientCreate($input: ClientCreateInput!) {
    clientCreate(input: $input) {
      client { id firstName lastName companyName emails { address } }
      userErrors { message path }
    }
  }
`;

async function isAuthorized(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length);
  // Service role key — preferred path for server-to-server calls.
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Accept the legacy service-role key stored in vault (used by DB-triggered
  // net.http_post calls that pre-date the signing-keys rotation).
  try {
    const { data: vaultKey } = await supabase.rpc('admin_get_service_role_key' as never);
    if (typeof vaultKey === 'string' && vaultKey.length > 0 && token === vaultKey) {
      return true;
    }
  } catch {
    /* noop — fall through to JWT path */
  }

  // Otherwise accept admin user JWTs (for manual ops + testing).
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return false;
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', data.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    return Boolean(roleRow);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  if (!(await isAuthorized(req))) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid JSON' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { user_id, subscription_id } = parsed.data;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await withLogging({
      source: 'jobber',
      event: 'sync_customer',
      payload: { user_id },
      fn: async () => {
        // Find the target subscription row.
        const subQuery = supabase
          .from('subscriptions')
          .select('id, jobber_client_id')
          .eq('user_id', user_id);
        const { data: subRow, error: subErr } = subscription_id
          ? await subQuery.eq('id', subscription_id).maybeSingle()
          : await subQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (subErr) throw new Error(`subscription lookup failed: ${subErr.message}`);
        if (!subRow) throw new Error('no subscription row found for user');

        if (subRow.jobber_client_id) {
          return { ok: true as const, reused: true as const, jobber_client_id: subRow.jobber_client_id };
        }

        // Pull profile for client identity.
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, phone, address_line1, address_line2, city, zip')
          .eq('user_id', user_id)
          .maybeSingle();

        const { data: userRow } = await supabase.auth.admin.getUserById(user_id);
        const email = userRow?.user?.email ?? null;

        const input: Record<string, unknown> = {
          firstName: profile?.first_name ?? 'Tidy',
          lastName: profile?.last_name ?? 'Customer',
        };
        if (email) input.emails = [{ description: 'MAIN', address: email, primary: true }];
        if (profile?.phone) input.phones = [{ description: 'MAIN', number: profile.phone, primary: true }];
        if (profile?.address_line1) {
          input.billingAddress = {
            street1: profile.address_line1,
            street2: profile.address_line2 ?? undefined,
            city: profile.city ?? 'Miami',
            province: 'FL',
            postalCode: profile.zip ?? undefined,
            country: 'US',
          };
        }

        const data = await jobberGraphQL<{
          clientCreate: {
            client: { id: string } | null;
            userErrors: Array<{ message: string; path: string[] }>;
          };
        }>(CLIENT_CREATE, { input });

        const errs = data.clientCreate.userErrors;
        if (errs && errs.length) {
          throw new Error(`clientCreate userErrors: ${errs.map((e) => e.message).join('; ')}`);
        }
        const jobberClientId = data.clientCreate.client?.id;
        if (!jobberClientId) throw new Error('clientCreate returned no client id');

        const { error: updErr } = await supabase
          .from('subscriptions')
          .update({ jobber_client_id: jobberClientId })
          .eq('id', subRow.id);
        if (updErr) throw new Error(`subscriptions update failed: ${updErr.message}`);

        return { ok: true as const, reused: false as const, jobber_client_id: jobberClientId };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[jobber-sync-customer] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
