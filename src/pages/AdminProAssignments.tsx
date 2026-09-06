/**
 * Admin — Pro route assignments (/admin/pro-assignments)
 *
 * Route ownership, not per-visit dispatch: a customer gets one Pro, and every
 * visit created after that inherits it automatically (trigger
 * visits_inherit_assigned_pro). This screen does the three things ops needs:
 *   1. assign or change a customer's Pro
 *   2. override a single visit's Pro (coverage, sick day)
 *   3. see upcoming visits with nobody on them
 */
import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserCheck, CalendarClock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type ProOption = { id: string; first_name: string; last_name: string; contractor_id: string | null };

type CustomerRow = {
  id: string;
  user_id: string;
  status: string | null;
  assigned_pro_id: string | null;
  frequency: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type UnassignedVisit = {
  id: string;
  subscription_id: string | null;
  scheduled_start: string | null;
  service_type: string | null;
  street: string | null;
  zip: string | null;
  customer_first_name: string | null;
};

const proLabel = (p: ProOption) => `${p.first_name} ${p.last_name}`.trim();

export default function AdminProAssignments() {
  const [pros, setPros] = useState<ProOption[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [visits, setVisits] = useState<UnassignedVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: proRows }, { data: subRows }, { data: visitRows, error: visitErr }] = await Promise.all([
        supabase
          .from("applicants")
          .select("id, first_name, last_name, contractor_id")
          .not("contractor_id", "is", null)
          .order("first_name"),
        supabase
          .from("subscriptions")
          .select("id, user_id, status, assigned_pro_id, frequency")
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        supabase.rpc("admin_unassigned_visits"),
      ]);
      if (visitErr) throw visitErr;

      const subs = (subRows ?? []) as CustomerRow[];
      const ids = subs.map((s) => s.user_id);
      let names: Record<string, { first_name: string | null; last_name: string | null }> = {};
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", ids);
        names = Object.fromEntries(
          (profiles ?? []).map((p) => [p.user_id, { first_name: p.first_name, last_name: p.last_name }]),
        );
      }

      setPros((proRows ?? []) as ProOption[]);
      setCustomers(subs.map((s) => ({ ...s, ...(names[s.user_id] ?? {}) })));
      setVisits((visitRows ?? []) as UnassignedVisit[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assignCustomer = async (subscriptionId: string, applicantId: string) => {
    setBusy(subscriptionId);
    const { error: err } = await supabase.rpc("admin_assign_customer_pro", {
      _subscription_id: subscriptionId,
      _applicant_id: applicantId || null,
    });
    setBusy(null);
    if (err) return toast.error(err.message);
    toast.success("Route assigned. Future visits will inherit this Pro.");
    void load();
  };

  const assignVisit = async (visitId: string, applicantId: string) => {
    setBusy(visitId);
    const { error: err } = await supabase.rpc("admin_set_visit_pro", {
      _visit_id: visitId,
      _applicant_id: applicantId || null,
    });
    setBusy(null);
    if (err) return toast.error(err.message);
    toast.success("Visit override saved.");
    void load();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Helmet>
        <title>Pro assignments · Tidy admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Pro assignments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One Pro per customer. New visits inherit the route automatically; single visits can be overridden for
          coverage without changing route ownership.
        </p>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            <p className="font-semibold">Couldn't load assignments</p>
            <p>{error}</p>
            <button type="button" className="mt-2 underline" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <UserCheck className="h-4 w-4" /> Customers ({customers.length})
            </h2>
            {customers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active customers yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                {customers.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 border-b p-4 last:border-b-0">
                    <div className="min-w-[180px] flex-1">
                      <p className="font-semibold">
                        {[c.first_name, c.last_name].filter(Boolean).join(" ") || "Customer"}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.frequency ?? "—"} route</p>
                    </div>
                    <select
                      className="min-h-[40px] rounded-md border bg-background px-3 text-sm"
                      value={c.assigned_pro_id ?? ""}
                      disabled={busy === c.id}
                      onChange={(e) => void assignCustomer(c.id, e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {pros.map((p) => (
                        <option key={p.id} value={p.id}>
                          {proLabel(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> Unassigned upcoming visits ({visits.length})
            </h2>
            {visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Every upcoming visit has a Pro on it.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                {visits.map((v) => (
                  <div key={v.id} className="flex flex-wrap items-center gap-3 border-b p-4 last:border-b-0">
                    <div className="min-w-[200px] flex-1">
                      <p className="font-semibold">
                        {v.scheduled_start
                          ? new Date(v.scheduled_start).toLocaleString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Unscheduled"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {v.service_type ?? "—"} · {v.street ?? "—"} {v.zip ?? ""} · {v.customer_first_name ?? ""}
                      </p>
                    </div>
                    <select
                      className="min-h-[40px] rounded-md border bg-background px-3 text-sm"
                      defaultValue=""
                      disabled={busy === v.id}
                      onChange={(e) => void assignVisit(v.id, e.target.value)}
                    >
                      <option value="">Assign Pro…</option>
                      {pros.map((p) => (
                        <option key={p.id} value={p.id}>
                          {proLabel(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
