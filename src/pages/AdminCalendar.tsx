/**
 * /admin/calendar — Layer 1. Service days per service (ZIPs down, Mon–Sat across),
 * who claimed them, holiday blackouts, weather days and the Routes grid.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DAY_NAME, DAY_SHORT, SCHED_SERVICES, SERVICE_NAME, WEEKDAYS, schedError, type SchedService } from "@/lib/scheduling";

type ServiceDay = { id: string; service: string; zip: string; weekday: number; active: boolean; close_effective: string | null };
type Claim = { id: string; service: string; zip: string; weekday: number; status: string; start: string; end: string; drop_effective: string | null; pro_first_name: string; pro_active: boolean; fill_pct: number };
type Route = { service: string; zip: string; utilisation: number; state: string; waitlist: number; booked_hours: number; capacity_hours: number; open_unclaimed: number[] };
type State = {
  today: string; launch_date: string; zips: string[]; service_days: ServiceDay[]; claims: Claim[];
  blackouts: { id: string; off_date: string; label: string | null; kind: string; service: string | null; zip: string | null }[];
  routes: Route[]; reschedules_open: number; hire_specs: { id: string; spec: string; created_at: string }[];
};

const ROUTE_TONE: Record<string, string> = {
  OPEN: "bg-emerald-50 text-emerald-800 border-emerald-200",
  ACT: "bg-amber-50 text-amber-900 border-amber-300",
  FULL: "bg-destructive/10 text-destructive border-destructive/40",
};

export default function AdminCalendar() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const [bo, setBo] = useState({ date: "", label: "" });
  const [wx, setWx] = useState<{ service: SchedService; zip: string; date: string }>({ service: "lawn", zip: "33156", date: "" });

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_sched_state");
    if (error) { toast.error(schedError(error)); return; }
    setState(data as unknown as State);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const suggestion = useMemo(() => {
    const raw = params.get("open");
    if (!raw) return null;
    const [service, zip, wd] = raw.split(":");
    return { service, zip, weekday: Number(wd) };
  }, [params]);

  const setDay = async (service: string, zip: string, weekday: number, active: boolean) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_set_service_day", { _service: service as SchedService, _zip: zip, _weekday: weekday, _active: active });
    setBusy(false);
    if (error) { toast.error(schedError(error)); return; }
    const r = data as { state: string; effective_date?: string; customers?: number };
    toast.success(r.state === "closing" ? `Closing ${r.effective_date}. ${r.customers} customers will be offered a new day.` : r.state === "open" ? "Opened. Pros see it as OPEN now." : "Closed.");
    void load();
  };

  const addBlackout = async () => {
    if (!bo.date) return;
    const { data, error } = await supabase.rpc("admin_add_blackout", { _date: bo.date, _label: bo.label || "Holiday" });
    if (error) { toast.error(schedError(error)); return; }
    const r = data as { moved: number; queued: number };
    toast.success(`Blackout added. ${r.moved} visits moved, ${r.queued} need you in Reschedules.`);
    setBo({ date: "", label: "" }); void load();
  };
  const weatherDay = async () => {
    if (!wx.date) return;
    const { data, error } = await supabase.rpc("admin_weather_day", { _service: wx.service, _zip: wx.zip, _date: wx.date });
    if (error) { toast.error(schedError(error)); return; }
    const r = data as { moved: number; queued: number };
    toast.success(`Weather day set. ${r.moved} visits moved, ${r.queued} need you in Reschedules.`);
    void load();
  };

  if (!state) return <main className="p-8 text-muted-foreground">Loading…</main>;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>Calendar | Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Service calendar</h1>
            <p className="mt-1 text-sm text-muted-foreground">Tidy opens days. Pros claim them. Customers book claimed days only. No visit before {state.launch_date}.</p>
          </div>
          <Link to="/admin/reschedules" className={`rounded-md border px-3 py-2 text-sm font-semibold ${state.reschedules_open ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-foreground"}`}>
            Reschedules · {state.reschedules_open} open
          </Link>
        </header>

        {suggestion && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <p className="font-semibold">Open {DAY_NAME[suggestion.weekday]} for {SERVICE_NAME[suggestion.service]} in {suggestion.zip}?</p>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => { void setDay(suggestion.service, suggestion.zip, suggestion.weekday, true); setParams({}); }}>Open it</Button>
              <Button variant="outline" onClick={() => setParams({})}>Not now</Button>
            </div>
          </div>
        )}

        {state.hire_specs.length > 0 && (
          <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <h2 className="font-bold text-destructive">Hire for these days</h2>
            <ul className="mt-2 space-y-1 text-sm">{state.hire_specs.map((h) => <li key={h.id}>{h.spec}</li>)}</ul>
          </section>
        )}

        <section>
          <h2 className="text-lg font-bold">Routes · next 4 weeks</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">Service</th>{state.zips.map((z) => <th key={z} className="px-3 py-2 text-left">{z}</th>)}</tr></thead>
              <tbody>
                {SCHED_SERVICES.map((s) => (
                  <tr key={s} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold">{SERVICE_NAME[s]}</td>
                    {state.zips.map((z) => {
                      const r = state.routes.find((x) => x.service === s && x.zip === z);
                      if (!r) return <td key={z} />;
                      const loud = r.waitlist > 0 && r.open_unclaimed.length > 0;
                      return (
                        <td key={z} className="px-2 py-2">
                          <div className={`rounded-md border px-2 py-1.5 ${loud ? "border-destructive bg-destructive text-destructive-foreground" : ROUTE_TONE[r.state]}`}>
                            <p className="font-bold">{r.state} · {Math.round(r.utilisation * 100)}%</p>
                            <p className="text-xs">{r.booked_hours}/{r.capacity_hours} h · waitlist {r.waitlist}</p>
                            {loud && <p className="text-xs font-semibold">Waitlist + unclaimed {r.open_unclaimed.map((d) => DAY_SHORT[d]).join(", ")}</p>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {SCHED_SERVICES.map((s) => (
          <section key={s}>
            <h2 className="text-lg font-bold">{SERVICE_NAME[s]}</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">ZIP</th>{WEEKDAYS.map((d) => <th key={d} className="px-3 py-2 text-left">{DAY_SHORT[d]}</th>)}</tr></thead>
                <tbody>
                  {state.zips.map((z) => (
                    <tr key={z} className="border-t border-border">
                      <td className="px-3 py-2 font-semibold">{z}</td>
                      {WEEKDAYS.map((d) => {
                        const sd = state.service_days.find((x) => x.service === s && x.zip === z && x.weekday === d);
                        const cl = state.claims.find((x) => x.service === s && x.zip === z && x.weekday === d);
                        const served = !!sd?.active;
                        let label = "NOT SERVED"; let tone = "bg-muted text-muted-foreground";
                        if (cl && cl.status === "pending") { label = `PENDING · ${cl.pro_first_name}`; tone = "bg-amber-50 text-amber-900 border border-amber-300"; }
                        else if (cl) { label = `${cl.pro_first_name} · ${cl.fill_pct}%`; tone = "bg-primary text-primary-foreground"; }
                        else if (served) { label = "OPEN"; tone = "bg-card border border-primary/40 text-primary"; }
                        return (
                          <td key={d} className="px-2 py-2 align-top">
                            <div className={`rounded-md px-2 py-1.5 ${tone}`}>
                              <p className="text-xs font-bold">{label}</p>
                              {cl && <p className="text-[11px] opacity-80">{cl.start}–{cl.end}{cl.status === "dropping" ? ` · ends ${cl.drop_effective}` : ""}</p>}
                              {sd?.close_effective && <p className="text-[11px]">Closes {sd.close_effective}</p>}
                            </div>
                            <button type="button" disabled={busy} className="mt-1 text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                              onClick={() => {
                                if (served && !window.confirm(`Close ${DAY_NAME[d]} in ${z}? Booked customers get 14 days and are offered other days.`)) return;
                                void setDay(s, z, d, !served);
                              }}>
                              {served ? "Close day" : "Open day"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-bold">Holiday blackouts</h2>
            <p className="text-xs text-muted-foreground">Visits on a blackout date move automatically. Never counted against a Pro.</p>
            <ul className="mt-3 space-y-1 text-sm">
              {state.blackouts.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span>{b.off_date} · {b.label}{b.kind === "weather" ? " (weather)" : ""}</span>
                  <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={async () => { await supabase.rpc("admin_remove_blackout", { _id: b.id }); void load(); }}>Remove</button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input type="date" value={bo.date} onChange={(e) => setBo({ ...bo, date: e.target.value })} className="w-40" />
              <Input placeholder="Label" value={bo.label} onChange={(e) => setBo({ ...bo, label: e.target.value })} className="w-40" />
              <Button onClick={() => void addBlackout()} disabled={!bo.date}>Add blackout</Button>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-bold">Weather day</h2>
            <p className="text-xs text-muted-foreground">Moves every affected visit (catch-up day, then the ZIP's other day, then within 48 hours). Not counted.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={wx.service} onChange={(e) => setWx({ ...wx, service: e.target.value as SchedService })}>
                {SCHED_SERVICES.map((s) => <option key={s} value={s}>{SERVICE_NAME[s]}</option>)}
              </select>
              <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={wx.zip} onChange={(e) => setWx({ ...wx, zip: e.target.value })}>
                {state.zips.map((z) => <option key={z}>{z}</option>)}
              </select>
              <Input type="date" value={wx.date} onChange={(e) => setWx({ ...wx, date: e.target.value })} className="w-40" />
              <Button onClick={() => { if (window.confirm(`Weather day: ${SERVICE_NAME[wx.service]}, ${wx.zip}, ${wx.date}?`)) void weatherDay(); }} disabled={!wx.date}>Move visits</Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
