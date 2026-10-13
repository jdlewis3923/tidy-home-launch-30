/**
 * /admin/demand — reservation preferences (day + window) vs. claimed Pro days,
 * per service × ZIP, before the calendar locks. Preferences are never bookings.
 * A day holding more than 25% of a ZIP's preferences with no claim is flagged.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { DAY_SHORT, SERVICE_NAME } from "@/lib/scheduling";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Row = { service: string; zip: string; weekday: number; day: string; preferences: number; share: number; mornings: number; afternoons: number; claimed: boolean; flagged: boolean; fit_pct: number };
type Prop = { service: string; cluster: string; zips: string[]; customers: number; weekly_hours: number; weekly_visits: number; days_needed: number; weekdays: number[]; uncovered_days: number; aligned: boolean };
type Launch = { proposal: Prop[]; approved: { service: string; zip: string; weekday: number; approved_at: string }[]; locked: Record<string, boolean> };
const CLUSTER: Record<string, string> = { pinecrest: "Pinecrest", kendall: "Kendall + Kendall West" };
type Report = { rows: Row[]; claims: { service: string; zip: string; weekday: number; start: string; end: string; status: string }[]; missing_preference: number };

export default function AdminDemand() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!hasRole) return;
    void supabase.rpc("admin_demand_report").then(({ data, error }) => { if (error) setErr(error.message); else setR(data as unknown as Report); });
  }, [hasRole]);
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [edit, setEdit] = useState<Record<number, number[]>>({});
  const loadLaunch = () => void supabase.rpc("admin_launch_proposal").then(({ data, error }) => { if (error) setErr(error.message); else { setLaunch(data as unknown as Launch); setEdit({}); } });
  useEffect(() => { if (hasRole) loadLaunch(); }, [hasRole]);
  const approve = async () => {
    if (!launch) return;
    const rows = launch.proposal.filter((p) => !launch.locked[p.service]).map((p, i) => ({ service: p.service, zips: p.zips, weekdays: edit[launch.proposal.indexOf(p)] ?? p.weekdays, _i: i }));
    const { error } = await supabase.rpc("admin_approve_launch_calendar", { _rows: rows.map(({ _i, ...r }) => r) });
    if (error) { toast.error(error.message.includes("calendar_locked") ? "Locked — conversion has started." : error.message); return; }
    toast.success("Launch calendar approved. Service days updated."); loadLaunch();
  };
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
      {launch && (
        <section className="rounded-xl border-2 border-primary bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold text-foreground">Proposed launch calendar</h2>
            <Button onClick={() => void approve()} disabled={Object.values(launch.locked).every(Boolean)}>Approve</Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Days needed = weekly hours ÷ Pro-day capacity (lawn 8 h, car care 6.4 h, cleaning 8 h and max 3 homes). Mon–Thu only. Tap a day to edit. Locks at conversion.</p>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Service</th><th>Area</th><th>Customers</th><th>Hours / wk</th><th>Visits / wk</th><th>Days needed</th><th>Days</th></tr></thead>
            <tbody>
              {launch.proposal.map((p, i) => {
                const days = edit[i] ?? p.weekdays;
                const locked = launch.locked[p.service];
                return (
                  <tr key={i} className="border-t border-border text-foreground">
                    <td className="py-1.5 font-semibold">{SERVICE_NAME[p.service]}</td>
                    <td>{p.zips.length > 1 ? CLUSTER[p.cluster] : p.zips[0]}</td>
                    <td>{p.customers}</td><td>{p.weekly_hours}</td><td>{p.weekly_visits}</td>
                    <td>{p.days_needed}{p.uncovered_days > 0 && <span className="text-destructive"> (+{p.uncovered_days} over Mon–Thu)</span>}</td>
                    <td className="flex gap-1 py-1.5">
                      {[1, 2, 3, 4].map((d) => (
                        <button key={d} type="button" disabled={locked}
                          onClick={() => setEdit({ ...edit, [i]: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() })}
                          className={`rounded px-2 py-0.5 text-xs font-bold ${days.includes(d) ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>{DAY_SHORT[d]}</button>
                      ))}
                      {p.customers === 0 && <span className="text-xs text-muted-foreground">no day</span>}
                      {locked && <span className="text-xs text-muted-foreground">locked</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {launch.approved.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Approved {new Date(launch.approved[0].approved_at).toLocaleString()} · {launch.approved.length} service days.</p>}
        </section>
      )}
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
