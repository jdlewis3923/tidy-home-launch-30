/**
 * Admin → Health panel: who is still calling the decommissioned Jobber
 * endpoints.
 *
 * The Jobber endpoints are inert stubs that return 200, so a Zap still pointed
 * at one reports success forever. Each stub call writes an integration_logs row
 * instead of vanishing; this panel groups those rows so Justin can see exactly
 * which endpoints are still being hit — and therefore which Zaps to switch off
 * in Zapier. Read-only, no alerting.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface StubRow {
  event: string;
  created_at: string;
  detail: { function?: string; caller?: Record<string, unknown> } | null;
}

interface Grouped {
  fn: string;
  calls: number;
  last_at: string;
  callers: string[];
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function callerLabel(caller: Record<string, unknown> | undefined): string {
  if (!caller) return "unknown caller";
  if (caller.likely_zapier) return "Zapier";
  const style = String(caller.auth_style ?? "none");
  const ua = String(caller.user_agent ?? "").slice(0, 40);
  if (style === "cron_key") return "scheduled job";
  if (ua) return ua;
  return style === "none" ? "unauthenticated caller" : style;
}

export default function JobberStubCallers() {
  const [rows, setRows] = useState<Grouped[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("integration_logs")
      .select("event, created_at, detail")
      .eq("source", "jobber")
      .like("event", "decommissioned_stub_called:%")
      .order("created_at", { ascending: false })
      .limit(500);

    const map = new Map<string, Grouped>();
    for (const r of (data ?? []) as StubRow[]) {
      const fn = r.detail?.function ?? r.event.split(":")[1] ?? "unknown";
      const label = callerLabel(r.detail?.caller);
      const existing = map.get(fn);
      if (existing) {
        existing.calls += 1;
        if (!existing.callers.includes(label)) existing.callers.push(label);
      } else {
        map.set(fn, { fn, calls: 1, last_at: r.created_at, callers: [label] });
      }
    }
    setRows([...map.values()].sort((a, b) => b.calls - a.calls));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!loaded) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
      <div className="bg-amber-50 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
          Still calling Jobber (decommissioned)
        </p>
        <p className="mt-1 text-xs text-amber-800">
          These endpoints are inert and return 200 so nothing breaks. Anything listed here
          is a caller — usually a Zap — that is still firing and can be switched off at the
          source. An empty list means nothing is calling Jobber any more.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-xs text-slate-600">
          No calls recorded. Nothing is pointed at Jobber.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Endpoint</th>
              <th className="px-4 py-2 text-left">Caller</th>
              <th className="px-4 py-2 text-right">Calls</th>
              <th className="px-4 py-2 text-right">Last call</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.fn}>
                <td className="px-4 py-2 font-mono text-xs">{r.fn}</td>
                <td className="px-4 py-2 text-xs">{r.callers.join(", ")}</td>
                <td className="px-4 py-2 text-right tabular-nums text-xs">{r.calls}</td>
                <td className="px-4 py-2 text-right text-xs">{formatRelative(r.last_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
