import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CalmShell from '@/components/dashboard/CalmShell';
import { supabase } from '@/integrations/supabase/client';
import { CLAIM_KEY } from '@/pages/DashboardPlan';
import { useLanguage } from '@/contexts/LanguageContext';

/** The personal Convert link: loads the reservation's quote and opens a prefilled checkout. */
export default function ReserveConfirm() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke('reservation-claim', { body: { t: token } });
      const r = data?.reservation;
      if (error || !r) { setErr(t('This link is no longer active. Call (786) 829-1141 and we will sort it out.')); return; }
      if (r.status === 'converted') { navigate('/dashboard', { replace: true }); return; }
      // A car part that's waiting for its own date is left out; it joins the same bill when car care opens.
      const services = (r.services as string[]).filter((s) => !(r.waitlist_services as string[]).includes(s) && !(r.car_waiting && s === 'detailing'));
      const q = { ...(r.quote ?? {}) };
      if (r.car_waiting) delete q.carWashes;
      const state = {
        ...q, services, frequencies: Object.fromEntries(Object.entries(q.frequencies ?? {}).filter(([k]) => services.includes(k))),
        billingPeriod: q.billing_period === 'yearly' ? 'yearly' : q.billingPeriod ?? 'monthly',
        reservationId: r.id,
        cleaningRange: r.cleaning_verified_at ? null : r.cleaning_selected_size === 'custom' ? 'quote' : r.cleaning_selected_size ? Number(r.cleaning_selected_size) : q.cleaningRange,
        homeSqFt: r.cleaning_measured_sqft ?? q.homeSqFt ?? null,
        bathrooms: r.cleaning_verified_bathrooms != null ? String(r.cleaning_verified_bathrooms) : r.cleaning_bathrooms != null ? String(r.cleaning_bathrooms) : q.bathrooms,
        firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone, address: r.street, city: r.city || 'Miami', zip: r.zip,
        preferredDay: r.assigned_day ?? r.preferred_day, preferredTime: r.preferred_time, smsConsent: r.sms_consent, outOfCoverage: false,
      };
      sessionStorage.setItem(CLAIM_KEY, JSON.stringify({ token, state }));
      navigate('/dashboard/plan', { replace: true });
    })();
  }, [token, navigate, t]);

  return (
    <CalmShell step={0} totalSteps={0} microcopy="">
      <div className="rounded-3xl border border-hairline bg-white p-10 text-center">
        <p className="text-sm text-ink-soft" data-testid="claim-status">{err ?? t('Loading your plan…')}</p>
      </div>
    </CalmShell>
  );
}
