/**
 * TIDY — Brevo template registry (single source of truth).
 *
 * Every customer- and contractor-facing email is a Brevo TEMPLATE. The design
 * lives in Brevo; this file maps an event to its template ID.
 *
 * Rules:
 *  - No numeric template ID literals anywhere else in the codebase.
 *  - Never send hand-built HTML for these events. If a template ID is missing
 *    at runtime, log a named error and return ok:false — never fall back to
 *    inline HTML. Silent HTML fallback is exactly how the current drift began.
 *
 * Edge functions cannot import from src/, so the same table is mirrored in
 * supabase/functions/_shared/emailTemplates.ts. Keep the two identical.
 */
export const EMAIL = {
  // Customer lifecycle
  WELCOME_CONFIRMED:      40,
  ACCOUNT_SETUP_NUDGE:    25,
  FIRST_VISIT_SCHEDULED:  24,
  VISIT_REMINDER:         41,
  FIRST_VISIT_FOLLOWUP:   26,
  VISIT_RATING:           42,
  REVIEW_REQUEST:         27,
  SERVICE_RECOVERY:       28,
  ADDON_CONFIRMED:        60,

  // Billing
  PAYMENT_FAILED:         43,
  PAYMENT_FINAL_NOTICE:   15,
  CARD_EXPIRING:          59,
  RENEWAL_CONFIRMED:      44,
  REFERRAL_EARNED:        45,

  // Retention
  PRECHURN_SKIP:          58,
  MILESTONE_3MO:          56,
  MILESTONE_6MO:          57,
  PAUSE_OFFER:            36,
  CANCEL_CONFIRMED:       37,

  // Re-engagement
  REENGAGE_45D:           54,
  REENGAGE_60D_PAUSED:    55,
  WINBACK_30D:            38,
  WINBACK_90D:            32,

  // No-convert sequence
  NOCONVERT_SOFT:         50,
  NOCONVERT_OBJECTION:    51,
  NOCONVERT_FINAL:        52,
  NOCONVERT_ARCHIVE:      53,

  // Bundle
  BUNDLE_M1:              17,
  BUNDLE_M2:              18,
  BUNDLE_M3:              19,

  // Contractor
  CONTRACTOR_WELCOME_T1:   64,
  CONTRACTOR_T2_OFFER:     61,
  CONTRACTOR_T2_CONFIRMED: 62,
  CONTRACTOR_T1_RETURN:    63,
  CONTRACTOR_COI_REJECTED: 65,
  CONTRACTOR_COI_EXPIRING: 66,
} as const;

export type EmailKey = keyof typeof EMAIL;
export type EmailTemplateId = (typeof EMAIL)[EmailKey];

/**
 * Required merge params per template. A send missing any of these must fail
 * loudly rather than deliver an email showing a raw {{ params.x }} to a
 * customer.
 */
export const REQUIRED_PARAMS: Partial<Record<EmailKey, readonly string[]>> = {
  WELCOME_CONFIRMED: ['subscription_services', 'monthly_total'],
  FIRST_VISIT_SCHEDULED: ['service_type', 'service_date', 'time_window', 'service_address'],
  VISIT_REMINDER: ['service_type', 'service_date', 'time_window', 'service_address'],
  VISIT_RATING: ['service_type', 'service_address', 'completion_time', 'pro_name'],
  SERVICE_RECOVERY: ['service_type', 'reservice_date'],
  PAYMENT_FAILED: ['AMOUNT', 'RETRY_DATE'],
  PAYMENT_FINAL_NOTICE: ['AMOUNT', 'RETRY_DATE'],
  CARD_EXPIRING: ['EXPIRY_DATE', 'CARD_LAST4'],
  RENEWAL_CONFIRMED: ['billing_month', 'service_type', 'amount_charged', 'next_billing_date'],
  REFERRAL_EARNED: ['referred_name', 'next_billing_date'],
  ADDON_CONFIRMED: ['firstname', 'addon_name', 'addon_price', 'visit_date', 'invoice_date'],
  CONTRACTOR_WELCOME_T1: ['first_name', 'tier_progression_url'],
  CONTRACTOR_T2_OFFER: ['first_name', 'upload_coi_url'],
  CONTRACTOR_COI_REJECTED: ['first_name', 'upload_coi_url'],
  CONTRACTOR_COI_EXPIRING: [
    'first_name',
    'upload_coi_url',
    'coi_carrier_name',
    'coi_expires_at',
    'days_until_expiry',
  ],
  CONTRACTOR_T1_RETURN: ['first_name', 'effective_date', 'reason', 'coaching_call_url'],
};

/** Reverse lookup: template ID -> registry key (for logging and validation). */
export function emailKeyForId(templateId: number): EmailKey | undefined {
  return (Object.keys(EMAIL) as EmailKey[]).find((k) => EMAIL[k] === templateId);
}

/**
 * Returns the list of required params missing from `params` for a template.
 * Empty array means the send is safe.
 */
export function missingRequiredParams(
  templateId: number,
  params: Record<string, unknown> | undefined,
): string[] {
  const key = emailKeyForId(templateId);
  if (!key) return [];
  const required = REQUIRED_PARAMS[key];
  if (!required?.length) return [];
  const p = params ?? {};
  return required.filter((name) => {
    const v = p[name];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
}
