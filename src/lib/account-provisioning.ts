/**
 * Tidy — Account provisioning (Phase 2)
 *
 * Phase 2 narrowed this down: it now ONLY signs the customer in (or
 * creates an account) and upserts their profile. Subscription + visit
 * rows are written by the stripe-webhook handler using a service-role
 * client because RLS now blocks client-side INSERTs on those tables.
 *
 * Lifecycle:
 *   - new email → signUp (auto-confirm is on)
 *   - existing email → signInWithPassword
 *   - either way the session persists in localStorage so the customer
 *     returns from Stripe already authenticated.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ConfigState } from '@/lib/dashboard-pricing';

export type ProvisionResult =
  | { ok: true; userId: string }
  | { ok: false; message: string };

export async function provisionAccount(state: ConfigState): Promise<ProvisionResult> {
  let userId: string | null = null;

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: state.email.trim().toLowerCase(),
    password: state.password,
  });

  if (signInData?.user) {
    userId = signInData.user.id;
  } else {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: state.email.trim().toLowerCase(),
      password: state.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          first_name: state.firstName,
          last_name: state.lastName,
          phone: state.phone,
        },
      },
    });
    if (signUpError) {
      if (
        signInError?.message?.toLowerCase().includes('invalid login') &&
        signUpError.message?.toLowerCase().includes('already')
      ) {
        return {
          ok: false,
          message:
            'an account with this email already exists. enter your existing password — or use forgot password.',
        };
      }
      return { ok: false, message: signUpError.message };
    }
    userId = signUpData.user?.id ?? null;
  }

  if (!userId) {
    return { ok: false, message: 'could not create your account. please try again.' };
  }

  // Profile upsert is still client-side (RLS allows the user to write
  // their own profile row).
  await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        first_name: state.firstName,
        last_name: state.lastName,
        phone: state.phone,
        address_line1: state.address,
        city: state.city,
        zip: state.zip,
        special_instructions: state.accessNotes,
        preferred_day: state.preferredDay,
        preferred_time: state.preferredTime,
      },
      { onConflict: 'user_id' },
    );

  // Subscription + visit rows are now provisioned by the stripe-webhook
  // handler (checkout.session.completed) using the service role.
  return { ok: true, userId };
}
