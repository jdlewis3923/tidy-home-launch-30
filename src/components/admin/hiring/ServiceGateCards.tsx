/**
 * Per-service gate cards for /admin/site-status.
 *
 * A service goes live only when a real pro can do the work: background check
 * clear, certificate of insurance verified, contract signed — and for car care,
 * a bound business policy that has not expired. Green and automatic means it
 * flips itself on at the next 7:00 AM; red pulls it down immediately.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, X, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface GateRow {
  service: string;
  is_live: boolean;
  auto_mode: boolean;
  business_policy_required: boolean;
  business_policy_bound: boolean;
  business_policy_doc_url: string | null;
  business_policy_effective: string | null;
  business_policy_expires: string | null;
  go_live_scheduled_for: string | null;
  last_change_reason: string | null;
}

const LABEL: Record<string, string> = {
  cleaning: "House Cleaning",
  lawn: "Lawn Care",
  car_care: "Car Care",
};

function Condition({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-600" />}
      <span className={ok ? "text-slate-700" : "text-rose-700"}>{label}</span>
    </li>
  );
}

export default function ServiceGateCards() {
  const [rows, setRows] = useState<GateRow[]>([]);
  const [proCounts, setProCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: gates }, { data: pros }] = await Promise.all([
      supabase.from("service_gates").select(
        "service, is_live, auto_mode, business_policy_required, business_policy_bound, business_policy_doc_url, business_policy_effective, business_policy_expires, go_live_scheduled_for, last_change_reason",
      ),
      supabase.from("applicants").select("service, bg_check_status, coi_general_liability_status, contracts_signed"),
    ]);
    const counts: Record<string, number> = { cleaning: 0, lawn: 0, car_care: 0 };
    for (const p of pros ?? []) {
      const checkr = p.bg_check_status === "clear";
      const coi = p.coi_general_liability_status === "verified";
      if (!checkr || !coi || p.contracts_signed !== true) continue;
      for (const key of Object.keys(counts)) {
        if (String(p.service ?? "").includes(key)) counts[key] += 1;
      }
    }
    setProCounts(counts);
    setRows((gates ?? []) as unknown as GateRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = async (service: string, values: Partial<GateRow>, message: string) => {
    setBusy(service);
    const { error } = await supabase
      .from("service_gates")
      .update({ ...values, last_changed_at: new Date().toISOString() })
      .eq("service", service);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(message);
    load();
  };

  if (loading) {
    return <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading service gates…</p>;
  }

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Service gates</h2>
      {rows.map((row) => {
        const pros = proCounts[row.service] ?? 0;
        const policyOk = !row.business_policy_required
          || (row.business_policy_bound
            && !!row.business_policy_expires
            && new Date(row.business_policy_expires).getTime() > Date.now());
        const green = pros >= 1 && policyOk;
        return (
          <section key={row.service} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">{LABEL[row.service] ?? row.service}</h3>
                <p className="mt-1 flex items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${row.is_live ? "bg-emerald-500" : "bg-rose-500"}`} />
                  {row.is_live ? "Live on the site" : "Showing “Opening soon — join the list”"}
                </p>
                {row.go_live_scheduled_for && !row.is_live && (
                  <p className="mt-1 text-xs text-emerald-700">
                    Scheduled to go live {new Date(row.go_live_scheduled_for).toLocaleString()}
                  </p>
                )}
                {row.last_change_reason && (
                  <p className="mt-1 text-xs text-slate-500">{row.last_change_reason}</p>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Automatic
                <Switch
                  checked={row.auto_mode}
                  disabled={busy === row.service}
                  onCheckedChange={(v) => patch(row.service, { auto_mode: !!v }, v ? "Automatic on" : "Automatic off")}
                  aria-label={`Automatic go-live for ${row.service}`}
                />
              </label>
            </div>

            <ul className="mt-4 space-y-1">
              <Condition ok={pros >= 1} label={`At least one active pro (${pros})`} />
              {row.business_policy_required && (
                <Condition ok={policyOk} label="Business policy bound and not expired" />
              )}
              <Condition ok={green} label={green ? "Gate is green" : "Gate is red"} />
            </ul>

            {row.business_policy_required && (
              <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={row.business_policy_bound}
                    disabled={busy === row.service}
                    onChange={(e) => patch(row.service, { business_policy_bound: e.target.checked },
                      e.target.checked ? "Policy marked bound" : "Policy marked not bound")}
                  />
                  Business policy bound
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600" htmlFor={`eff-${row.service}`}>
                      Effective date
                    </label>
                    <Input
                      id={`eff-${row.service}`} type="date" className="min-h-11"
                      defaultValue={row.business_policy_effective ?? ""}
                      onBlur={(e) => e.target.value !== (row.business_policy_effective ?? "")
                        && patch(row.service, { business_policy_effective: e.target.value || null }, "Effective date saved")}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600" htmlFor={`exp-${row.service}`}>
                      Expiry date
                    </label>
                    <Input
                      id={`exp-${row.service}`} type="date" className="min-h-11"
                      defaultValue={row.business_policy_expires ?? ""}
                      onBlur={(e) => e.target.value !== (row.business_policy_expires ?? "")
                        && patch(row.service, { business_policy_expires: e.target.value || null }, "Expiry date saved")}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600" htmlFor={`doc-${row.service}`}>
                    Policy document
                  </label>
                  <input
                    id={`doc-${row.service}`} type="file" accept="application/pdf,image/*"
                    className="mt-1 block w-full text-sm"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setBusy(row.service);
                      const path = `business-policy/${row.service}/${Date.now()}-${file.name}`;
                      const { error } = await supabase.storage.from("company-docs").upload(path, file);
                      setBusy(null);
                      if (error) { toast.error(error.message); return; }
                      patch(row.service, { business_policy_doc_url: path }, "Policy document uploaded");
                    }}
                  />
                  {row.business_policy_doc_url && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <Upload className="h-3 w-3" /> {row.business_policy_doc_url}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4">
              <Button
                size="sm" variant="outline" className="min-h-11" disabled={busy === row.service}
                onClick={() => patch(row.service, { is_live: !row.is_live, auto_mode: false },
                  row.is_live ? "Taken off the site" : "Set live")}
                title="Turning this by hand also switches automatic off, so the hourly check cannot undo you"
              >
                {row.is_live ? "Take off the site" : "Set live now"}
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
