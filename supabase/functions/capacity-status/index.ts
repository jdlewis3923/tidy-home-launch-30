// Tidy — capacity-status. Admin-only read of live capacity + hiring pressure.
//
// Returns one result per service plus the worst one, so the dashboard banner
// can be rendered without scrolling.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { computeCapacityFromDb } from '../_shared/capacity.ts';
import {
  BILLABLE_HOURS_PER_PRO_PER_MONTH,
  COMFORT_CEILING,
  HIRING_CYCLE_DAYS,
  HOURS_PER_CUSTOMER_PER_MONTH,
  worstService,
} from '../_shared/capacity-config.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: isAdmin } = await supabase.rpc('has_role', {
    _user_id: userData.user.id,
    _role: 'admin',
  });
  if (isAdmin !== true) return jsonResponse({ ok: false, error: 'forbidden — admin role required' }, 403);

  try {
    const services = await computeCapacityFromDb(supabase);
    return jsonResponse({
      ok: true,
      as_of: new Date().toISOString(),
      config: {
        billable_hours_per_pro_per_month: BILLABLE_HOURS_PER_PRO_PER_MONTH,
        comfort_ceiling: COMFORT_CEILING,
        hiring_cycle_days: HIRING_CYCLE_DAYS,
        hours_per_customer_per_month: HOURS_PER_CUSTOMER_PER_MONTH,
      },
      services,
      worst: worstService(services),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[capacity-status] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
