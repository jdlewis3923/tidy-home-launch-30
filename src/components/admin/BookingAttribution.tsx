import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { HEARD_FROM, HEARD_LABELS, validHeardFrom } from '@/lib/heard-from';
type Report = { channels: { channel: string; reservations: number; paid_plans: number }[]; qr_zips: { zip: string; scans: number }[] };
export default function BookingAttribution() {
  const report = useQuery({ queryKey: ['booking-attribution'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_booking_attribution');
    if (error) throw error;
    return data as unknown as Report;
  }});
  const channels = HEARD_FROM.map(channel => report.data?.channels.find(c => c.channel === channel) ?? { channel, reservations: 0, paid_plans: 0 }).concat(report.data?.channels.filter(c => !validHeardFrom(c.channel)) ?? []);
  return <section className="border-y border-border py-5 text-foreground">
    <h2 className="text-lg font-semibold">Booking attribution</h2>
    {report.error && <p role="alert" className="mt-2 text-sm text-destructive">Couldn’t load attribution: {report.error.message}</p>}
    {report.isPending ? <p className="mt-2 text-muted-foreground">Loading…</p> : report.data && <div className="mt-3 grid gap-6 md:grid-cols-2">
      <div><h3 className="mb-2 text-sm font-semibold">By discovery channel · all time</h3><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2">Channel</th><th>Reservations</th><th>Active paid plans</th></tr></thead><tbody>{channels.map(c => <tr key={c.channel} className="border-b border-border"><td className="py-2">{validHeardFrom(c.channel) ? HEARD_LABELS[c.channel][0] : 'Not recorded'}</td><td>{c.reservations}</td><td>{c.paid_plans}</td></tr>)}</tbody></table></div>
      <div><h3 className="mb-2 text-sm font-semibold">Recorded QR scans by ZIP · all time</h3><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2">ZIP</th><th>Scans</th></tr></thead><tbody>{report.data.qr_zips.map(q => <tr key={q.zip} className="border-b border-border"><td className="py-2">{q.zip}</td><td>{q.scans}</td></tr>)}</tbody></table>{!report.data.qr_zips.length && <p className="text-sm text-muted-foreground">No QR scans recorded.</p>}</div>
    </div>}
  </section>;
}