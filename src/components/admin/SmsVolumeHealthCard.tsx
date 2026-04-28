/**
 * SMS Volume Health — admin card for /admin/kpis (or any admin dashboard).
 * Pulls 30-day data from sms_log and renders 3 metrics:
 *   • Avg SMS per active customer / month
 *   • % of customers on needs_me or critical
 *   • STOP rate (last 30d)
 */
import { useEffect, useState } from 'react';
import { MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function SmsVolumeHealthCard() {
  const [loading, setLoading] = useState(true);
  const [avgPerCustomer, setAvgPerCustomer] = useState<number>(0);
  const [reducedPct, setReducedPct] = useState<number>(0);
  const [stopPct, setStopPct] = useState<number>(0);
  const [activeCustomers, setActiveCustomers] = useState<number>(0);

  useEffect(() => {
    const load = async () => {
      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: sentLogs }, { data: profiles }, { data: subs }] = await Promise.all([
        supabase.from('sms_log').select('user_id').gte('sent_at', since30).eq('suppressed', false),
        supabase.from('profiles').select('user_id, sms_preference, sms_opt_out'),
        supabase.from('subscriptions').select('user_id, status'),
      ]);

      const activeUserIds = new Set(
        (subs ?? []).filter((s: any) => ['active', 'trialing'].includes(s.status)).map((s: any) => s.user_id)
      );
      const totalSent = (sentLogs ?? []).filter((l: any) => activeUserIds.has(l.user_id)).length;
      const activeCount = activeUserIds.size || 1;
      setActiveCustomers(activeUserIds.size);
      setAvgPerCustomer(totalSent / activeCount);

      const profs = profiles ?? [];
      const reducedCount = profs.filter((p: any) =>
        p.sms_preference === 'needs_me' || p.sms_preference === 'critical'
      ).length;
      setReducedPct((profs.length > 0 ? (reducedCount / profs.length) * 100 : 0));

      const stoppedCount = profs.filter((p: any) => p.sms_opt_out).length;
      setStopPct((profs.length > 0 ? (stoppedCount / profs.length) * 100 : 0));

      setLoading(false);
    };
    load();
  }, []);

  const metric = (label: string, value: string, target: string, ok: boolean) => (
    <div className="rounded-xl border border-[hsl(var(--hairline))] bg-white/60 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-2xl font-bold tabular-nums ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>{value}</span>
        <span className="text-[11px] text-ink-faint">target {target}</span>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-[hsl(var(--hairline))] bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <MessageSquare className="h-4 w-4 text-[hsl(var(--primary))]" />
          SMS Volume Health
        </h3>
        <span className="text-[11px] text-ink-faint">{activeCustomers} active · 30d</span>
      </div>
      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-ink-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {metric('Avg SMS / customer / mo', avgPerCustomer.toFixed(1), '≤8', avgPerCustomer <= 8)}
          {metric('% reduced preference', reducedPct.toFixed(1) + '%', '<10%', reducedPct < 10)}
          {metric('STOP rate (30d)', stopPct.toFixed(1) + '%', '<2%', stopPct < 2)}
        </div>
      )}
    </div>
  );
}
