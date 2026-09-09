/**
 * Open failures panel — the reader admin_alerts never had.
 *
 * Twenty-one places in the system write to admin_alerts (a text that could not
 * be delivered, a Pro notification that reached nobody, a background check
 * invite that failed, a scheduled job that stopped running). Until now nothing
 * a human can open ever read that table, so every "the failure is now visible"
 * path ended in silence. This calls admin-failure-review and shows what is
 * still unresolved.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AlertRow {
  id: string;
  alert_type: string;
  title: string;
  body: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

interface OutboxRow {
  id: string;
  to_phone_e164: string;
  template_name: string | null;
  status: string;
  attempts: number;
  queued_reason: string | null;
  release_after: string | null;
  last_error: string | null;
  created_at: string;
}

interface ReviewResponse {
  ok: boolean;
  as_of?: string;
  open_alerts?: AlertRow[];
  stripe_failures?: unknown[];
  sms_delivery_failures?: unknown[];
  sms_outbox?: OutboxRow[];
  /** Per-query failures. Ignoring these printed "nothing unresolved" over a read that never happened. */
  errors?: string[];
  error?: string;
}


function relative(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export default function OpenAlertsPanel() {
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: resp, error: err } = await supabase.functions.invoke(
      "admin-failure-review",
      { body: {} },
    );
    if (err) setError(err.message || "Could not load open failures");
    else if (!(resp as ReviewResponse)?.ok) setError((resp as ReviewResponse)?.error ?? "Unknown error");
    else {
      setData(resp as ReviewResponse);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const alerts = data?.open_alerts ?? [];
  const outbox = data?.sms_outbox ?? [];
  const stripeFailures = data?.stripe_failures ?? [];
  const smsFailures = data?.sms_delivery_failures ?? [];
  const queryErrors = data?.errors ?? [];
  const canceled = outbox.filter((o) => o.status === "canceled");
  const waiting = outbox.filter((o) => o.status !== "canceled");

  return (
    <div className={`overflow-hidden rounded-xl border shadow-sm ${queryErrors.length > 0 ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between bg-slate-100 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Open failures ({alerts.length})
        </p>
        <button
          onClick={load}
          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white"
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {error && <p className="px-4 py-3 text-xs text-rose-700">{error}</p>}

      {/* A check that could not run is not a clean bill of health. */}
      {queryErrors.length > 0 && (
        <div className="border-b border-rose-200 px-4 py-3 text-xs text-rose-800">
          <p className="font-semibold">Some checks could not run — this list is incomplete</p>
          <ul className="mt-1 space-y-1">
            {queryErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {!error && queryErrors.length === 0 && alerts.length === 0 && !loading && (
        <p className="px-4 py-4 text-xs text-slate-600">
          Nothing unresolved right now.
        </p>
      )}


      {alerts.length > 0 && (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {alerts.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="text-xs font-semibold text-slate-900">{a.title}</p>
                  {a.body && (
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{a.body}</p>
                  )}
                  <p className="mt-1 font-mono text-[10px] uppercase text-slate-400">
                    {a.alert_type}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-[11px] text-slate-500">
                  {relative(a.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(outbox.length > 0 || stripeFailures.length > 0 || smsFailures.length > 0) && (
        <div className="border-t border-slate-200 px-4 py-3 text-[11px] text-slate-600">
          <p className="font-semibold text-slate-800">Also waiting</p>
          <ul className="mt-1 space-y-1">
            {waiting.length > 0 && (
              <li>
                {waiting.length} text{waiting.length === 1 ? "" : "s"} queued or failed
                {waiting[0]?.last_error ? ` — latest: ${waiting[0].last_error.slice(0, 120)}` : ""}
              </li>
            )}
            {/* Canceled texts were never sent to anybody — they belong here, not nowhere. */}
            {canceled.length > 0 && (
              <li>
                {canceled.length} text{canceled.length === 1 ? "" : "s"} canceled without being sent
                {canceled[0]?.last_error ? ` — latest: ${canceled[0].last_error.slice(0, 120)}` : ""}
              </li>
            )}
            {stripeFailures.length > 0 && <li>{stripeFailures.length} payment events not processed</li>}
            {smsFailures.length > 0 && <li>{smsFailures.length} texts reported undelivered by the carrier</li>}
          </ul>
        </div>
      )}

    </div>
  );
}
