/**
 * Small dashboard chip: "Add-ons this year: N · You've added $X in extras"
 */
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function AddonsYearStat({ userId }: { userId: string }) {
  const [count, setCount] = useState(0);
  const [revenueCents, setRevenueCents] = useState(0);

  useEffect(() => {
    const load = async () => {
      const ystart = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const { data } = await supabase
        .from('addon_attaches')
        .select('addon_price_cents, status')
        .eq('user_id', userId)
        .in('status', ['pending_visit', 'completed'])
        .gte('attached_at', ystart);
      const rows = data ?? [];
      setCount(rows.length);
      setRevenueCents(rows.reduce((s, r: any) => s + (r.addon_price_cents ?? 0), 0));
    };
    load();
  }, [userId]);

  if (count === 0) return null;

  return (
    <div className="rounded-xl border border-[hsl(var(--hairline))] bg-white px-4 py-3 text-sm text-ink-soft shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
        <span>
          Add-ons this year: <span className="font-semibold text-ink">{count}</span> · You've added{' '}
          <span className="font-semibold text-ink">${(revenueCents / 100).toFixed(0)}</span> in extras
        </span>
      </div>
    </div>
  );
}
