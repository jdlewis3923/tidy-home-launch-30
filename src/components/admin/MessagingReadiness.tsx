/**
 * Messaging readiness (Twilio) — shared admin surface.
 *
 * `useMessagingReadiness` calls the `twilio-readiness` edge function, which
 * verifies the sending number against the live Twilio account instead of
 * trusting the secret: set / owned / SMS-capable / carrier-registered.
 *
 * `MessagingReadinessCard` renders the full card on the Health page.
 * `MessagingReadinessBanner` renders the red failure banner on Command.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export type ReadinessStatus = "pass" | "warn" | "fail";
export type ReadinessCheck = {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  remediation?: string;
};
export type ReadinessResult = {
  overall: ReadinessStatus;
  checks: ReadinessCheck[];
  owned_numbers: string[];
  from: string;
  checked_at?: string;
};

export function useMessagingReadiness(enabled: boolean) {
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("twilio-readiness", { body: {} });
    setLoading(false);
    if (error || (data as { error?: string } | null)?.error) {
      setError(error?.message ?? (data as { error?: string })?.error ?? "Messaging check failed");
      setResult(null);
      return;
    }
    setResult(data as ReadinessResult);
  }, []);

  useEffect(() => {
    if (enabled) void run();
  }, [enabled, run]);

  return { result, loading, error, run };
}

const TONE: Record<ReadinessStatus, { bg: string; ring: string; text: string; Icon: typeof CheckCircle2 }> = {
  pass: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", Icon: CheckCircle2 },
  warn: { bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-700", Icon: AlertTriangle },
  fail: { bg: "bg-red-50", ring: "ring-red-200", text: "text-red-700", Icon: XCircle },
};

export function MessagingReadinessCard() {
  const { result, loading, error, run } = useMessagingReadiness(true);
  const overall = result?.overall ?? (error ? "fail" : "warn");
  const tone = TONE[overall];

  return (
    <div className={`rounded-xl border ${overall === "fail" ? "border-red-300" : "border-slate-200"} bg-white shadow-sm`}>
      <div className="flex items-start gap-3 p-4 border-b border-slate-100">
        <div className={`rounded-full p-2 ${tone.bg} ring-1 ${tone.ring} shrink-0`}>
          <MessageSquare className={`h-5 w-5 ${tone.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-[#0D1117]">Messaging readiness (Twilio)</h3>
            <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${tone.bg} ${tone.text} ring-1 ${tone.ring}`}>
              {overall}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Checks the sending number against the live Twilio account — not just the saved setting.
          </p>
          {result?.checked_at && (
            <p className="text-xs text-slate-400 mt-1">
              Checked {new Date(result.checked_at).toLocaleString("en-US")}
            </p>
          )}
        </div>
        <Button onClick={run} disabled={loading} variant="outline" size="sm" className="gap-1.5 shrink-0">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Re-check
        </Button>
      </div>

      <div className="divide-y divide-slate-100">
        {loading && !result && (
          <p className="p-4 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Asking Twilio…
          </p>
        )}
        {error && <p className="p-4 text-sm text-red-700">{error}</p>}
        {result?.checks.map((c) => {
          const t = TONE[c.status];
          const Icon = t.Icon;
          return (
            <div key={c.id} className="p-4 flex items-start gap-3">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${t.text}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0D1117]">{c.label}</p>
                <p className="text-sm text-slate-600 break-words">{c.detail}</p>
                {c.remediation && c.status !== "pass" && (
                  <p className="text-xs text-slate-500 mt-1 italic">→ {c.remediation}</p>
                )}
              </div>
            </div>
          );
        })}
        {result && result.owned_numbers.length > 0 && (
          <div className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Numbers this account owns</p>
            <p className="text-sm text-slate-700 mt-1 break-words">{result.owned_numbers.join(", ")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function MessagingReadinessBanner({ enabled = true }: { enabled?: boolean }) {
  const { result, error } = useMessagingReadiness(enabled);
  if (!enabled) return null;
  if (!error && (!result || result.overall !== "fail")) return null;

  const failures = (result?.checks ?? []).filter((c) => c.status === "fail");

  return (
    <section className="rounded-xl border border-red-300 bg-red-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-red-800">Text messages will not send</h2>
          {error ? (
            <p className="text-sm text-red-700 mt-1">{error}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm text-red-700 list-disc pl-4">
              {failures.map((c) => (
                <li key={c.id}>{c.detail}</li>
              ))}
            </ul>
          )}
          <Link to="/admin/setup-check" className="inline-block mt-2 text-sm font-semibold text-red-800 underline">
            Open Health → Messaging readiness
          </Link>
        </div>
      </div>
    </section>
  );
}
