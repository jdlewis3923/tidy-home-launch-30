import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const REASON: Record<string, string> = {
  quiet_hours: 'waiting for texting hours',
  reservation_confirm: 'reservation confirmations',
  reservation_convert: 'convert links',
  post_visit: 'post-visit follow-ups',
};

/** One line on Command: how many texts are queued right now, and why. */
export default function SmsQueueLine() {
  const { data } = useQuery({
    queryKey: ['sms-queue-line'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: rows }, { count: failed }] = await Promise.all([
        supabase.from('sms_outbox').select('queued_reason, last_error').eq('status', 'queued').limit(1000),
        supabase.from('sms_outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('updated_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
      ]);
      const by: Record<string, number> = {};
      let retrying = 0;
      for (const r of rows ?? []) { by[r.queued_reason ?? 'other'] = (by[r.queued_reason ?? 'other'] ?? 0) + 1; if (r.last_error) retrying++; }
      return { total: rows?.length ?? 0, by, retrying, failed: failed ?? 0 };
    },
  });
  if (!data) return null;
  const parts = Object.entries(data.by).map(([k, n]) => `${n} ${REASON[k] ?? k.replace(/_/g, ' ')}`);
  return (
    <div data-testid="sms-queue-line" className="admin-page-surface flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2.5 text-sm">
      <MessageSquare className="h-4 w-4 text-muted-foreground" />
      <span className="font-semibold">{data.total} text{data.total === 1 ? '' : 's'} queued</span>
      <span className="text-muted-foreground">
        {data.total ? `· ${parts.join(' · ')}` : '· nothing waiting'}
        {data.retrying ? ` · ${data.retrying} retrying after a send error` : ''}
        {data.failed ? ` · ${data.failed} failed this week (alerted)` : ''}
      </span>
    </div>
  );
}
