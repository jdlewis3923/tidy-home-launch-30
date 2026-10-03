/** Reservations forecast: totals by service, ZIP and day, revenue and visits/week if all convert. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FOUNDING_CAP, LAUNCH_DATE_LONG, RESERVABLE_SERVICES, RESERVATION_SERVICE_LABEL, type ReservableService } from "@/lib/launch";

export type ReservationRow = {
  id: string; created_at: string; status: string; first_name: string; last_name: string; email: string; phone: string;
  services: string[]; waitlist_services: string[]; lines: { service: string; size: number | string | null; cadence: string | null; monthly: number; visits_per_month: number }[];
  monthly_cents: number; street: string; zip: string; preferred_day: string; preferred_time: string; heard_from: string; heard_other: string | null;
  invited_at: string | null; assigned_day: string | null; assigned_window: string | null; assigned_pro_first_name: string | null; converted_at: string | null; is_test_row: boolean; sms_consent: boolean;
};

export function useReservations() {
  const [rows, setRows] = useState<ReservationRow[] | null>(null);
  const load = async () => {
    const { data } = await supabase.from("reservations").select("*").order("created_at", { ascending: true });
    setRows((data ?? []) as unknown as ReservationRow[]);
  };
  useEffect(() => { load(); }, []);
  return { rows, reload: load };
}

const ZIPS = ["33156", "33183", "33186"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Any day"];

export function forecast(rows: ReservationRow[]) {
  const live = rows.filter((r) => r.status !== "canceled");
  const bySvc = Object.fromEntries(RESERVABLE_SERVICES.map((s) => [s, { reserved: 0, waitlist: 0, monthly: 0, perWeek: 0 }])) as Record<ReservableService, { reserved: number; waitlist: number; monthly: number; perWeek: number }>;
  const byZip: Record<string, number> = {}; const byDay: Record<string, number> = {};
  for (const r of live) {
    byZip[r.zip] = (byZip[r.zip] ?? 0) + 1;
    byDay[r.preferred_day] = (byDay[r.preferred_day] ?? 0) + 1;
    for (const s of r.services as ReservableService[]) {
      if (!bySvc[s]) continue;
      if (r.waitlist_services.includes(s)) { bySvc[s].waitlist++; continue; }
      bySvc[s].reserved++;
      const line = r.lines.find((l) => l.service === s);
      if (line) { bySvc[s].monthly += line.monthly; bySvc[s].perWeek += (line.visits_per_month * 12) / 52; }
    }
  }
  const monthly = RESERVABLE_SERVICES.reduce((n, s) => n + bySvc[s].monthly, 0);
  return { total: live.length, bySvc, byZip, byDay, monthly };
}

export default function ReservationsForecast({ compact = false }: { compact?: boolean }) {
  const { rows } = useReservations();
  if (!rows) return null;
  const f = forecast(rows);
  return (
    <section className="admin-page-surface rounded-lg border bg-card p-5" data-testid="reservations-forecast">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-bold text-foreground">Reservations</h2>
        <span className="text-xs text-muted-foreground">first visits {LAUNCH_DATE_LONG} · if every reservation converts</span>
        {compact && <Link to="/admin/reservations" className="ml-auto text-xs font-semibold text-primary underline">Open reservations</Link>}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Total reservations" value={String(f.total)} testid="fc-total" />
        <Stat label="Est. monthly revenue" value={`$${f.monthly.toFixed(0)}`} testid="fc-revenue" />
        {RESERVABLE_SERVICES.slice(0, 2).map((s) => null)}
      </div>
      <table className="mt-4 w-full text-sm">
        <thead><tr className="text-xs text-muted-foreground"><th className="text-left font-medium">Service</th><th className="text-right font-medium">Reserved</th><th className="text-right font-medium">Waitlist</th><th className="text-right font-medium">Est. $/mo</th><th className="text-right font-medium">Visits / week</th></tr></thead>
        <tbody>{RESERVABLE_SERVICES.map((s) => (
          <tr key={s} className="border-t border-border" data-testid={`fc-${s}`}>
            <td className="py-1.5 font-medium">{RESERVATION_SERVICE_LABEL[s]}</td>
            <td className="text-right tabular-nums">{f.bySvc[s].reserved} / {FOUNDING_CAP}</td>
            <td className="text-right tabular-nums">{f.bySvc[s].waitlist}</td>
            <td className="text-right tabular-nums">${f.bySvc[s].monthly.toFixed(0)}</td>
            <td className="text-right tabular-nums font-semibold">{f.bySvc[s].perWeek.toFixed(1)}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 text-xs">
        <div><p className="font-semibold text-foreground">By ZIP</p><div className="mt-1 flex flex-wrap gap-2">{ZIPS.map((z) => <span key={z} className="rounded border border-border px-2 py-1 tabular-nums">{z} · {f.byZip[z] ?? 0}</span>)}</div></div>
        <div><p className="font-semibold text-foreground">By preferred day</p><div className="mt-1 flex flex-wrap gap-2">{DAYS.map((d) => <span key={d} className="rounded border border-border px-2 py-1 tabular-nums">{d.slice(0, 3)} · {f.byDay[d] ?? 0}</span>)}</div></div>
      </div>
    </section>
  );
}

function Stat({ label, value, testid }: { label: string; value: string; testid: string }) {
  return <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold tabular-nums text-foreground" data-testid={testid}>{value}</p></div>;
}
