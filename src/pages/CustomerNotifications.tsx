/**
 * Customer notification preferences — controls SMS volume.
 *
 * Three options:
 *   • all       — every operational SMS (default)
 *   • needs_me  — only SMS that require customer action
 *   • critical  — only payment-failure SMS
 *
 * Also shows the user's 90-day SMS history count (from sms_log) and a
 * projection of what 'needs_me' would have sent.
 */
import { useEffect, useState } from 'react';
import { Bell, Loader2, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { useToast } from '@/hooks/use-toast';

type Preference = 'all' | 'needs_me' | 'critical';

const NEEDS_ME_TYPES = new Set([
  'pv4_review', 'payment_renewal', 'payment_failed',
  'payment_failed_final', 'running_late', 'customer_not_home',
]);

const OPTIONS: Array<{ key: Preference; title: string; subtitle: string }> = [
  { key: 'all',      title: 'All updates',                  subtitle: 'Get every visit reminder and update.' },
  { key: 'needs_me', title: 'Only when something needs me', subtitle: 'Reviews, billing, and visit-day issues only.' },
  { key: 'critical', title: 'Critical only',                subtitle: 'Just payment failures.' },
];

export default function CustomerNotifications() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preference, setPreference] = useState<Preference>('all');
  const [userId, setUserId] = useState<string | null>(null);
  const [last90Count, setLast90Count] = useState<number>(0);
  const [needsMeProjection, setNeedsMeProjection] = useState<number>(0);

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) { navigate('/login', { replace: true }); return; }
      setUserId(uid);

      const { data: profile } = await supabase
        .from('profiles')
        .select('sms_preference')
        .eq('user_id', uid)
        .maybeSingle();
      setPreference(((profile?.sms_preference as Preference) ?? 'all'));

      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: logs } = await supabase
        .from('sms_log')
        .select('sms_type, suppressed')
        .eq('user_id', uid)
        .gte('sent_at', since)
        .eq('suppressed', false);
      const sent = logs ?? [];
      setLast90Count(sent.length);
      setNeedsMeProjection(sent.filter((l: any) => NEEDS_ME_TYPES.has(l.sms_type)).length);

      setLoading(false);
    };
    load();
  }, [navigate]);

  const save = async (next: Preference) => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ sms_preference: next })
      .eq('user_id', userId);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    setPreference(next);
    toast({ title: 'Saved', description: 'Your notification preference is updated.' });
  };

  return (
    <div className="min-h-screen bg-cream text-ink">
      <DashboardTopNav />
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        <header className="mt-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-ink-soft">Choose how often you hear from us.</p>
          </div>
        </header>

        {loading ? (
          <div className="mt-10 flex items-center gap-2 text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-2xl border border-[hsl(var(--hairline))] bg-white p-5">
              <p className="text-sm text-ink-soft">
                You've received <span className="font-semibold text-ink">{last90Count}</span> Tidy SMS in the last 90 days.
                {' '}Switching to <span className="font-semibold">Only when something needs me</span> would have sent ~<span className="font-semibold">{needsMeProjection}</span>.
              </p>
            </div>

            <ul className="mt-6 space-y-3">
              {OPTIONS.map(opt => {
                const selected = preference === opt.key;
                return (
                  <li key={opt.key}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => save(opt.key)}
                      className={`w-full rounded-2xl border-2 p-5 text-left transition-all ${
                        selected
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                          : 'border-[hsl(var(--hairline))] bg-white hover:border-[hsl(var(--primary))]/40'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-1 grid h-5 w-5 place-items-center rounded-full border-2 ${
                            selected ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]' : 'border-ink-faint'
                          }`}
                        >
                          {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                        </span>
                        <div>
                          <div className="font-semibold text-ink">{opt.title}</div>
                          <div className="mt-1 text-sm text-ink-soft">{opt.subtitle}</div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 text-xs text-ink-faint">
              Reply STOP to any Tidy text to unsubscribe entirely.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
