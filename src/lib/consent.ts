/**
 * Consent capture helpers.
 *
 * Every consent we rely on legally (Terms assent at signup, TCPA SMS opt-in
 * at checkout) is written to the database with its exact wording, version,
 * timestamp and IP. The IP is resolved server-side by the record-consent
 * edge function — never sent from the browser.
 *
 * When you change any wording below, bump the matching version string so old
 * records stay attributable to the text that was actually shown.
 */
import { supabase } from '@/integrations/supabase/client';

export const TERMS_VERSION = '2026-08-24';
export const TERMS_CONSENT_WORDING =
  'By creating an account you agree to our Terms of Service and Privacy Policy.';

export const SMS_CONSENT_VERSION = '2026-08-24';
export const SMS_CONSENT_WORDING =
  'I agree to receive recurring automated SMS messages from Tidy Home Concierge LLC at the phone number I provided. Msg & data rates may apply. Reply STOP to opt out.';

type ConsentKind = 'terms' | 'sms';

/**
 * Fire-and-forget consent write. Never blocks or fails the user's flow, but
 * always logs so a missing record is visible rather than silent.
 */
export async function recordConsent(opts: {
  kind: ConsentKind;
  version: string;
  wording: string;
  granted?: boolean;
  email?: string;
}): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('record-consent', {
      body: {
        kind: opts.kind,
        version: opts.version,
        wording: opts.wording,
        granted: opts.granted ?? true,
        email: opts.email,
      },
    });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      console.error('[record-consent]', error?.message ?? data);
    }
  } catch (err) {
    console.error('[record-consent] threw', err);
  }
}
