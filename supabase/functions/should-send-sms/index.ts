// Tidy — Returns whether an SMS may be sent to a customer.
//
// Inputs: { user_id: uuid, sms_type: SmsType }
// Output: { allow: boolean, reason?: string, preference: string }
//
// Used by Zaps and edge functions as a pre-flight filter before calling
// send-twilio-sms. Quiet hours are still enforced inside send-twilio-sms.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { preferenceAllows, type SmsType } from '../_shared/sms-policy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SMS_TYPES: SmsType[] = [
  'morning_confirmation',
  'eta',
  'post_visit_review',
  'pv4_review',
  'running_late',
  'customer_not_home',
  'payment_renewal',
  'payment_failed',
  'payment_failed_final',
  'addon_attach',
];

const BodySchema = z.object({
  user_id: z.string().uuid(),
  sms_type: z.enum(SMS_TYPES as [SmsType, ...SmsType[]]),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  }

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { user_id, sms_type } = parsed.data;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error } = await admin
    .from('profiles')
    .select('sms_preference, sms_opt_out, last_pv4_review_request_at')
    .eq('user_id', user_id)
    .maybeSingle();

  if (error) {
    return jsonResponse({ ok: false, error: 'profile_lookup_failed', detail: error.message }, 500);
  }

  if (!profile) {
    return jsonResponse({ ok: true, allow: false, reason: 'profile_not_found', preference: 'all' });
  }

  if (profile.sms_opt_out === true) {
    return jsonResponse({ ok: true, allow: false, reason: 'opted_out', preference: profile.sms_preference });
  }

  const prefCheck = preferenceAllows(profile.sms_preference, sms_type);
  if (!prefCheck.allow) {
    return jsonResponse({ ok: true, allow: false, reason: prefCheck.reason, preference: profile.sms_preference });
  }

  // PV4 quarterly cap.
  if (sms_type === 'pv4_review' && profile.last_pv4_review_request_at) {
    const last = new Date(profile.last_pv4_review_request_at).getTime();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    if (Date.now() - last < ninetyDaysMs) {
      return jsonResponse({ ok: true, allow: false, reason: 'pv4_within_90_days', preference: profile.sms_preference });
    }
  }

  return jsonResponse({ ok: true, allow: true, preference: profile.sms_preference });
});
