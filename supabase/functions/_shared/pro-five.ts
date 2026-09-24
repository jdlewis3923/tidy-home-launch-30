/**
 * Tidy — the five things a Pro finishes before their first route, and the
 * links that finish each one. Single source for the "you're all set" email,
 * the daily missing-items chase and the admin Send menu.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SITE, checkrInviteUrl, ensureOnboardingTokens } from './pro-onboarding.ts';
import type { FiveKey } from './pro-emails.ts';

export const FIVE_KEYS: FiveKey[] = ['background', 'insurance', 'contract', 'intake', 'photo'];

export interface FiveRecord {
  applicant: Record<string, any>;
  kit: Record<string, any> | null;
  done: Record<FiveKey, boolean>;
  urls: Record<FiveKey, string | null>;
  missing: FiveKey[];
}

function token(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Ensures the contract token exists and returns it. */
export async function ensureContractToken(admin: SupabaseClient, applicant: { id: string; contract_token?: string | null }): Promise<string> {
  if (applicant.contract_token) return applicant.contract_token;
  const t = token();
  await admin.from('applicants').update({ contract_token: t }).eq('id', applicant.id);
  return t;
}

export async function loadFive(admin: SupabaseClient, id: string, opts: { mintTokens?: boolean } = {}): Promise<FiveRecord> {
  const { data: applicant, error } = await admin.from('applicants').select('*').eq('id', id).maybeSingle();
  if (error || !applicant) throw new Error('applicant_not_found');
  const getKit = async () => (await admin.from('pro_kit').select('*').eq('applicant_id', id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
  let kit = await getKit();

  if (opts.mintTokens) {
    if (!applicant.coi_token || !kit?.token) {
      try {
        const t = await ensureOnboardingTokens(admin, id);
        applicant.coi_token = applicant.coi_token ?? t.coi_token;
        kit = await getKit();
      } catch { /* links stay null */ }
    }
    applicant.contract_token = await ensureContractToken(admin, applicant);
  }

  const done: Record<FiveKey, boolean> = {
    background: applicant.bg_check_status === 'clear',
    insurance: applicant.coi_review_status === 'approved' || applicant.coi_review_status === 'verified',
    contract: applicant.contracts_signed === true,
    intake: !!kit && (['submitted', 'kit_ordered', 'kit_issued'].includes(kit.status) || !!kit.submitted_at),
    photo: kit?.badge_photo_status === 'approved',
  };
  const urls: Record<FiveKey, string | null> = {
    background: checkrInviteUrl(applicant as never),
    insurance: applicant.coi_token ? `${SITE}/coi/${applicant.coi_token}` : null,
    contract: applicant.contract_token ? `${SITE}/contract/${applicant.contract_token}` : null,
    intake: kit?.token ? `${SITE}/intake/${kit.token}` : null,
    photo: kit?.badge_photo_token ? `${SITE}/photo/${kit.badge_photo_token}` : null,
  };
  return { applicant, kit: kit ?? null, done, urls, missing: FIVE_KEYS.filter((k) => !done[k]) };
}
