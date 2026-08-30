/**
 * /admin/capacity — capacity + hiring pressure.
 *
 * One card per service: current customers, max at capacity, fill %, and what to
 * do about it. A banner surfaces the worst service so an amber or red state is
 * visible without scrolling.
 *
 * Cleaning almost always trips first: 6.34 hours per customer-month against
 * lawn's 1.96 — roughly 25 customers per pro versus 82. That is correct.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BILLABLE_HOURS_PER_PRO_PER_MONTH,
  COMFORT_CEILING,
  HIRING_CYCLE_DAYS,
  type CapacityResult,
  type CapacityStatus,
} from "@/lib/capacity-config";

interface CapacityResponse {
  ok: true;
  as_of: string;
  services: CapacityResult[];
  worst: CapacityResult | null;
}

const TONE: Record<CapacityStatus, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  red: "border-rose-300 bg-rose-50 text-rose-900",
};

const DOT: Record<CapacityStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-600",
};

function fmtFill(pct: number | null): string {
  if (pct === null) return "no pro assigned";
  return `${Math.round(pct * 100)}%`;
}

export default function AdminCapacity() {
  const [data, setData] = useState<CapacityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error: err } = await supabase.functions.invoke("capacity-status");
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    if (!res?.ok) {
      if (typeof res?.error === "string" && res.error.includes("forbidden")) setForbidden(true);
      else setError(res?.error ?? "capacity-status failed");
      setLoading(false);
      return;
    }
    setError(null);
    setData(res as CapacityResponse);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  if (forbidden) {
    return <main className="p-8"><h1 className="text-xl font-semibold">Admins only.</h1></main>;
  }

  const worst = data?.worst ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Capacity &amp; hiring</h1>
        <p className="text-sm text-muted-foreground">
          Alerts fire at {Math.round(COMFORT_CEILING * 100)}% fill, not at 100%. Hiring takes{" "}
          {HIRING_CYCLE_DAYS} days end to end. One pro delivers{" "}
          {BILLABLE_HOURS_PER_PRO_PER_MONTH} billable hours a month.
        </p>
      </header>

      {worst && worst.status !== "green" && (
        <div className={`mb-6 rounded-xl border px-4 py-3 ${TONE[worst.status]}`} role="alert">
          <div className="flex items-center gap-2 font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${DOT[worst.status]}`} />
            {worst.serviceName}: {worst.message}
          </div>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.services ?? []).map((s) => (
          <section key={s.service} className={`rounded-xl border p-4 ${TONE[s.status]}`}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{s.serviceName}</h2>
              <span className={`h-2.5 w-2.5 rounded-full ${DOT[s.status]}`} />
            </div>

            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Current customers</dt>
                <dd className="font-semibold">{s.activeCustomers}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Max at capacity</dt>
                <dd className="font-semibold">{s.maxAtCapacity}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Fill</dt>
                <dd className="font-semibold">{fmtFill(s.fillPct)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Pros assigned</dt>
                <dd>{s.assignedPros.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Growth</dt>
                <dd>{s.growthPerMonth > 0 ? `+${s.growthPerMonth}/mo` : "not growing"}</dd>
              </div>
            </dl>

            <p className="mt-3 text-sm font-medium">{s.message}</p>
            <p className="mt-1 text-xs opacity-80">
              {s.hoursPerCustomer} hrs per customer-month · comfort ceiling at{" "}
              {s.maxAtComfortCeiling} customers
            </p>
          </section>
        ))}
      </div>

      <ProAssignments onChanged={load} />

      <p className="mt-6 text-xs text-muted-foreground">
        {loading ? "Refreshing…" : data ? `As of ${new Date(data.as_of).toLocaleString()}` : ""}
      </p>
    </main>
  );
}
