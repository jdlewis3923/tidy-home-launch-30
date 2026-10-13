/**
 * /admin/demand — reservation preferences (day + window) vs. claimed Pro days,
 * per service × ZIP, before the calendar locks. Preferences are never bookings.
 * A day holding more than 25% of a ZIP's preferences with no claim is flagged.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { SERVICE_NAME } from "@/lib/scheduling";

type Row = { service: string; zip: string; weekday: number; day: string; preferences: number; share: number; mornings: number; afternoons: number; claimed: boolean; flagged: boolean; fit_pct: number };
type Report = { rows: Row[]; claims: { service: string; zip: string; weekday: number; start: string; end: string; status: string }[]; missing_preference: number };

export default function AdminDemand() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!hasRole) return;
    void supabase.rpc("admin_demand_report").then(({ data, error }) => { if (error) setErr(error.message); else setR(data as unknown as Report); });
  }, [hasRole]);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const row of r?.rows ?? []) { const k = `${row.service}|${row.zip}`; m.set(k, [...(m.get(k) ?? []), row]); }
    return [...m.entries()];
  }, [r]);

  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Loading…</main>;
  if (!hasRole) return <Navigate to="/login" replace />;
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <header>
        <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Demand before the calendar locks</h1>
        <p className="mt-1 text-sm text-muted-foreground">What reservations prefer vs. which days Pros have claimed. Swap a service day on the calendar before the lock.</p>
        <Link to="/admin/calendar" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">Open the service-day calendar →</Link>
      </header>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {r && r.missing_preference > 0 && <p className="text-sm text-muted-foreground">{r.missing_preference} reservation(s) have no preferred day.</p>}
      {r && groups.length === 0 && <p className="text-sm text-muted-foreground">No reservation preferences yet.</p>}
      {groups.map(([k, rows]) => {
        const [svc, zip] = k.split("|");
        return (
          <section key={k} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-foreground">{SERVICE_NAME[svc] ?? svc} · {zip}</h2>
              <p className="text-sm font-semibold text-foreground">{rows[0].fit_pct}% of reservations fit a claimed day</p>
            </div>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1">Day</th><th>Preferred</th><th>Share</th><th>AM / PM</th><th>Claimed</th></tr></thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.weekday} className={x.flagged ? "bg-destructive/10 font-semibold text-destructive" : "text-foreground"}>
                    <td className="py-1">{x.day}{x.flagged && " — uncovered demand"}</td>
                    <td>{x.preferences}</td><td>{x.share}%</td><td>{x.mornings} / {x.afternoons}</td><td>{x.claimed ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}
