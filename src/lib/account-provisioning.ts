/**
 * Tidy — Account provisioning during checkout.
 *
 * Called from StepPayment BEFORE Stripe handoff. Creates a Supabase
 * account (or signs in if it already exists), then writes the subscription
 * row + a provisional first visit so the dashboard has real data when
 * the customer lands on /dashboard.
 *
 * Lifecycle:
 *   - new email → signUp (auto-confirm is on, see configure_auth)
 *   - existing email → signInWithPassword using the password they typed
 *   - either way, the auth session is persisted in localStorage so they
 *     return to /dashboard already logged in.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  ConfigState,
  calculatePricing,
  ServiceType,
  Frequency,
} from '@/lib/dashboard-pricing';

export type ProvisionResult =
  | { ok: true; userId: string; subscriptionId: string }
  | { ok: false; message: string };

/** Pick the soonest visit_date based on preferred day-of-week. */
function nextVisitDate(preferredDay: string): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();
  let target = today;
  if (preferredDay) {
    const idx = days.indexOf(preferredDay);
    if (idx >= 0) {
      const dow = today.getDay();
      let add = (idx - dow + 7) % 7;
      if (add < 2) add += 7; // give the team at least 2 days lead time
      target = new Date(today.getTime() + add * 86_400_000);
    } else {
      target = new Date(today.getTime() + 5 * 86_400_000);
    }
  } else {
    target = new Date(today.getTime() + 5 * 86_400_000);
  }
  return target.toISOString().slice(0, 10);
}

function timeWindowFromPreferred(pref: string): string {
  if (pref === 'morning') return '8:00 AM – 12:00 PM';
  if (pref === 'afternoon') return '12:00 PM – 5:00 PM';
  return '9:00 AM – 1:00 PM';
}

/** Spacing in days between recurring visits, by frequency. */
const FREQ_DAYS: Record<Frequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export async function provisionAccount(state: ConfigState): Promise<ProvisionResult> {
  // Try sign in first — if the user already exists with this email,
  // they typed their existing password into the password field and we
  // sign them straight in. If sign-in fails, attempt sign-up.
  let userId: string | null = null;

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: state.email.trim().toLowerCase(),
    password: state.password,
  });

  if (signInData?.user) {
    userId = signInData.user.id;
  } else {
    // Sign-in failed → try to create a new account.
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
      // If sign-in failed because of bad credentials AND sign-up failed
      // (likely email exists but password is wrong), surface a clear msg.
      if (signInError?.message?.toLowerCase().includes('invalid login') &&
          signUpError.message?.toLowerCase().includes('already')) {
        return {
          ok: false,
          message: 'an account with this email already exists. enter your existing password — or use forgot password.',
        };
      }
      return { ok: false, message: signUpError.message };
    }
    userId = signUpData.user?.id ?? null;
  }

  if (!userId) {
    return { ok: false, message: 'could not create your account. please try again.' };
  }

  // Make sure the profile carries the latest contact + access info.
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
      { onConflict: 'user_id' }
    );

  // Compute monthly total in cents for the subscription row.
  const pricing = calculatePricing(state);
  const monthlyTotalCents = Math.round(pricing.ongoing * 100);

  // Use the most-frequent service cadence for the subscription record.
  // (Each service can keep its own frequency for visit scheduling.)
  const frequencies = Object.values(state.frequencies);
  const dominantFrequency: Frequency =
    frequencies.includes('weekly')
      ? 'weekly'
      : frequencies.includes('biweekly')
        ? 'biweekly'
        : 'monthly';

  const today = new Date();
  const nextBilling = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const { data: subRow, error: subError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      services: state.services as ServiceType[],
      frequency: dominantFrequency,
      monthly_total_cents: monthlyTotalCents,
      status: 'active',
      next_billing_date: nextBilling.toISOString().slice(0, 10),
    })
    .select('id')
    .single();

  if (subError || !subRow) {
    return { ok: false, message: subError?.message ?? 'could not save your plan.' };
  }

  // Seed the next ~3 visits per service so the calendar isn't empty.
  const baseDate = nextVisitDate(state.preferredDay);
  const visits: Array<{
    user_id: string;
    subscription_id: string;
    service: ServiceType;
    visit_date: string;
    time_window: string;
    status: 'scheduled';
  }> = [];

  for (const svc of state.services) {
    const freq = state.frequencies[svc] ?? dominantFrequency;
    const spacing = FREQ_DAYS[freq];
    const start = new Date(baseDate);
    for (let i = 0; i < 3; i++) {
      const d = new Date(start.getTime() + i * spacing * 86_400_000);
      visits.push({
        user_id: userId,
        subscription_id: subRow.id,
        service: svc,
        visit_date: d.toISOString().slice(0, 10),
        time_window: timeWindowFromPreferred(state.preferredTime),
        status: 'scheduled',
      });
    }
  }

  if (visits.length > 0) {
    await supabase.from('visits').insert(visits);
  }

  return { ok: true, userId, subscriptionId: subRow.id };
}
