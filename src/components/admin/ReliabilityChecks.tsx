/**
 * Reliability checks for /admin/health: signing self-test, unread candidate
 * replies, stuck/failed texts, delivery receipts, duplicates, candidate errors.
 * Turns red when any check fails. Data comes from admin_reliability_checks().
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

interface Check { key: string; label: string; ok: boolean; detail: string; count?: number; at?: string | null }
interface Result { ok: boolean; checks: Check[]; as_of: string }

export default function ReliabilityChecks() {
  const [data, setData] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await (supabase.rpc as any)("admin_reliability_checks");
    if (error) setErr(error.message); else { setErr(null); setData(data as Result); }
  }, []);
  useEffect(() => { load(); const id = window.setInterval(load, 60_000); return () => window.clearInterval(id); }, [load]);

  const failing = !!err || (data ? !data.ok : false);
  return (
    <section className={`rounded-xl border-2 p-4 ${failing ? "border-destructive bg-destructive/10" : "border-primary/30 bg-card"}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={`flex items-center gap-2 text-lg font-bold ${failing ? "text-destructive" : "text-foreground"}`}>
          {failing ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5 text-primary" />}
          {err ? "Reliability checks could not load" : failing ? "Something needs attention" : "Candidate flow is healthy"}
        </h2>
        <button type="button" onClick={load} className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted" aria-label="Refresh checks">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      <ul className="mt-3 divide-y divide-border">
        {data?.checks.map((c) => (
          <li key={c.key} className="flex items-start justify-between gap-4 py-2 text-sm">
            <span className="flex items-center gap-2 text-foreground">
              <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.ok ? "bg-primary" : "bg-destructive"}`} />
              {c.label}
            </span>
            <span className={`text-right ${c.ok ? "text-muted-foreground" : "font-semibold text-destructive"}`}>{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
