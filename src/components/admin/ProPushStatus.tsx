/**
 * Who can Tidy actually reach? One row per Pro with a login: how many devices
 * have the Pro app registered for notifications, when that device was last
 * used, and whether a phone number exists for the text fallback.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BellRing, BellOff, MessageSquare, Loader2, RefreshCw } from "lucide-react";

type Row = {
  applicant_id: string;
  contractor_id: string;
  first_name: string | null;
  last_name: string | null;
  badge_status: string | null;
  devices: number;
  last_push_device_at: string | null;
  has_fallback_phone: boolean;
  reachable: boolean;
};

export default function ProPushStatus() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_pro_push_status");
    setBusy(false);
    if (error) { setError(error.message); return; }
    setError(null);
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => { void load(); }, []);

  const reachable = (rows ?? []).filter((r) => r.reachable).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-navy">Pro notifications — who is reachable</h2>
          <p className="mt-1 text-sm text-slate-600">
            {rows === null
              ? "Checking…"
              : `${reachable} of ${rows.length} pros have the Pro app registered on a phone. Anyone at zero only
                 sees notifications when they open the app — urgent ones fall back to a text.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-navy"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {rows !== null && rows.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No pros with a login yet.</p>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3">Pro</th>
                <th className="py-2 pr-3">App notifications</th>
                <th className="py-2 pr-3">Devices</th>
                <th className="py-2 pr-3">Last seen</th>
                <th className="py-2">Text fallback</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.applicant_id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-navy">
                    {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                    {r.badge_status && r.badge_status !== "active" && (
                      <span className="ml-2 text-[11px] font-medium uppercase text-slate-400">{r.badge_status}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.reachable ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <BellRing className="h-4 w-4" aria-hidden /> On
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-amber-700">
                        <BellOff className="h-4 w-4" aria-hidden /> Not set up
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{r.devices}</td>
                  <td className="py-2 pr-3 text-slate-600">
                    {r.last_push_device_at
                      ? new Date(r.last_push_device_at).toLocaleString("en-US", { timeZone: "America/New_York" })
                      : "—"}
                  </td>
                  <td className="py-2">
                    {r.has_fallback_phone ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <MessageSquare className="h-4 w-4 text-slate-400" aria-hidden /> Yes
                      </span>
                    ) : (
                      <span className="text-red-600">No number on file</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
