// Tidy — Shared SMS policy helpers.
//
// shouldSendSms(): given a user_id + sms_type, returns { allow, reason }
// based on the customer's profiles.sms_preference column and (where
// applicable) per-type dedupe rules.
//
// SMS type taxonomy:
//   morning_confirmation, eta, post_visit_review, pv4_review,
//   running_late, customer_not_home, payment_renewal, payment_failed,
//   payment_failed_final, addon_attach
//
// Preference buckets:
//   'all'      → every type allowed
//   'needs_me' → only: pv4_review, payment_renewal, payment_failed,
//                payment_failed_final, running_late, customer_not_home
//   'critical' → only: payment_failed, payment_failed_final

export type SmsType =
  | 'morning_confirmation'
  | 'eta'
  | 'post_visit_review'
  | 'pv4_review'
  | 'running_late'
  | 'customer_not_home'
  | 'payment_renewal'
  | 'payment_failed'
  | 'payment_failed_final'
  | 'addon_attach';

const NEEDS_ME_ALLOW: SmsType[] = [
  'pv4_review',
  'payment_renewal',
  'payment_failed',
  'payment_failed_final',
  'running_late',
  'customer_not_home',
];

const CRITICAL_ALLOW: SmsType[] = ['payment_failed', 'payment_failed_final'];

export function preferenceAllows(
  preference: string | null | undefined,
  smsType: SmsType,
): { allow: boolean; reason?: string } {
  const pref = (preference ?? 'all') as 'all' | 'needs_me' | 'critical';
  if (pref === 'all') return { allow: true };
  if (pref === 'needs_me') {
    return NEEDS_ME_ALLOW.includes(smsType)
      ? { allow: true }
      : { allow: false, reason: 'preference_needs_me' };
  }
  if (pref === 'critical') {
    return CRITICAL_ALLOW.includes(smsType)
      ? { allow: true }
      : { allow: false, reason: 'preference_critical' };
  }
  return { allow: true };
}

/** Logs a single SMS attempt (sent or suppressed) to public.sms_log. */
export async function logSms(
  admin: { from: (t: string) => any },
  row: {
    user_id: string | null;
    sms_type: SmsType | string;
    twilio_message_id?: string | null;
    suppressed?: boolean;
    suppression_reason?: string | null;
    context?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from('sms_log').insert({
      user_id: row.user_id,
      sms_type: row.sms_type,
      twilio_message_id: row.twilio_message_id ?? null,
      suppressed: row.suppressed ?? false,
      suppression_reason: row.suppression_reason ?? null,
      context: row.context ?? {},
      sent_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[sms-policy] logSms failed', err);
  }
}
