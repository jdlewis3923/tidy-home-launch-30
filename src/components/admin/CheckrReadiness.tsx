/**
 * Checkr readiness card for /admin/health.
 *
 * Reports whether each of the three Checkr secrets is set (a boolean only —
 * values are never returned by the function or rendered here), whether the
 * last API call succeeded, and when the last verified webhook arrived.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, RefreshCw, Loader2 } from "lucide-react";

interface Readiness {
  ok: true;
  state: "ready" | "failing" | "not_configured";
  secrets: Record<"CHECKR_API_KEY" | "CHECKR_PACKAGE" | "CHECKR_WEBHOOK_SECRET", boolean>;
  last_api_call: { event: string; status: string; at: string; error: string | null } | null;
  last_webhook_at: string | null;
  last_webhook_event: string | null;
  last_rejected_webhook_at: string | null;
  pending_checks: number;
  awaiting_manual_review: number;
}

function rel(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

const TONE: Record<Readiness["state"], string> = {
  ready: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  failing: "bg-rose-50 text-rose-800 ring-rose-200",
  not_configured: "bg-amber-50 text-amber-800 ring-amber-200",
};

const STATE_LABEL: Record<Readiness["state"], string> = {
  ready: "Ready",
  failing: "Last call failed",
  not_configured: "Secrets missing",
};

export default function CheckrReadinessCard() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("checkr-readiness", { body: {} });
    setLoading(false);
    if (err || (res as { error?: string })?.error) {
      setError(err?.message ?? (res as { error?: string })?.error ?? "Failed to load");
      return;
    }
    setData(res as Readiness);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-[#0D1117] inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#1FA1F0]" /> Checkr — background checks
        </h2>
        <div className="flex items-center gap-2">
          {data && (
            <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ring-1 ${TONE[data.state]}`}>
              {STATE_LABEL[data.state]}
            </span>
          )}
          <button onClick={load} disabled={loading} className="text-slate-400 hover:text-[#1FA1F0]" aria-label="Refresh Checkr readiness">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-700 mt-3">{error}</p>}

      {data && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(Object.keys(data.secrets) as Array<keyof Readiness["secrets"]>).map((k) => (
              <div key={k} className={`rounded-xl px-3 py-2 ring-1 ${data.secrets[k] ? "bg-emerald-50 ring-emerald-200 text-emerald-800" : "bg-rose-50 ring-rose-200 text-rose-800"}`}>
                <div className="text-[11px] font-mono">{k}</div>
                <div className="text-xs font-semibold">{data.secrets[k] ? "Set" : "Not set"}</div>
              </div>
            ))}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
            <dt>Last API call</dt>
            <dd className="text-right text-[#0D1117]">
              {data.last_api_call ? `${data.last_api_call.status} · ${rel(data.last_api_call.at)}` : "never"}
            </dd>
            <dt>Last webhook received</dt>
            <dd className="text-right text-[#0D1117]">{rel(data.last_webhook_at)}</dd>
            <dt>Checks in progress</dt>
            <dd className="text-right text-[#0D1117]">{data.pending_checks}</dd>
            <dt>Awaiting manual review</dt>
            <dd className="text-right text-[#0D1117]">{data.awaiting_manual_review}</dd>
          </dl>

          {data.last_api_call?.error && (
            <p className="text-xs text-rose-700 break-words">Last error: {data.last_api_call.error}</p>
          )}
          {data.last_rejected_webhook_at && (
            <p className="text-xs text-amber-700">
              A webhook was rejected by signature verification {rel(data.last_rejected_webhook_at)}.
            </p>
          )}
          <p className="text-[11px] text-slate-400">
            Secret values are never read into this page — only whether they exist.
          </p>
        </div>
      )}
    </div>
  );
}
