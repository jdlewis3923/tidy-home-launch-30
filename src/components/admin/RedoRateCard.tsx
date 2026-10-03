/** Redo rate per Pro and overall (last 30 days). Above 5% overall is a service problem. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = { pro: string; visits: number; redos: number };

export default function RedoRateCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [overall, setOverall] = useState<{ visits: number; redos: number }>({ visits: 0, redos: 0 });
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [{ data: vs }, { data: rs }, { data: aps }] = await Promise.all([
        supabase.from("visits").select("assigned_pro_id").not("completed_at", "is", null).eq("is_redo", false).gte("completed_at", since),
        supabase.from("redo_requests").select("pro_id").neq("status", "canceled").gte("requested_at", since),
        supabase.from("applicants").select("contractor_id, first_name, last_name").not("contractor_id", "is", null),
      ]);
      const name = (id: string | null) => { const a = (aps ?? []).find((x) => x.contractor_id === id); return a ? `${a.first_name} ${a.last_name?.[0] ?? ""}.` : "Unassigned"; };
      const map = new Map<string, Row>();
      for (const v of vs ?? []) { const k = v.assigned_pro_id ?? "none"; const r = map.get(k) ?? { pro: name(v.assigned_pro_id), visits: 0, redos: 0 }; r.visits++; map.set(k, r); }
      for (const r of rs ?? []) { const k = r.pro_id ?? "none"; const x = map.get(k) ?? { pro: name(r.pro_id), visits: 0, redos: 0 }; x.redos++; map.set(k, x); }
      setRows([...map.values()].sort((a, b) => b.redos - a.redos));
      setOverall({ visits: vs?.length ?? 0, redos: rs?.length ?? 0 });
    })();
  }, []);
  const pct = (r: number, v: number) => (v ? (r / v) * 100 : 0);
  const o = pct(overall.redos, overall.visits);
  const bad = o > 5;
  return (
    <div className={`rounded-xl border p-4 ${bad ? "border-destructive bg-destructive/5" : "border-border bg-card"}`} data-testid="redo-rate-card">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Redo rate · last 30 days</h3>
        <span className={`text-2xl font-bold tabular-nums ${bad ? "text-destructive" : "text-foreground"}`}>{o.toFixed(1)}%</span>
      </div>
      <p className="text-xs text-muted-foreground">{overall.redos} redos / {overall.visits} visits · above 5% is a service problem, not a member problem.</p>
      {rows && rows.length > 0 && (
        <table className="mt-3 w-full text-xs">
          <thead><tr className="text-muted-foreground"><th className="text-left font-medium">Pro</th><th className="text-right font-medium">Visits</th><th className="text-right font-medium">Redos</th><th className="text-right font-medium">Rate</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.pro} className="border-t border-border"><td className="py-1">{r.pro}</td><td className="text-right">{r.visits}</td><td className="text-right">{r.redos}</td>
              <td className={`text-right font-semibold ${pct(r.redos, r.visits) > 5 ? "text-destructive" : ""}`}>{pct(r.redos, r.visits).toFixed(1)}%</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
