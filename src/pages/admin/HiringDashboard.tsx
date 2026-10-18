/**
 * Hiring dashboard — /admin/hiring (hiring v5)
 * Seat rule per service, Intent-sorted candidate table, Today list, funnel, ghost report.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle } from "lucide-react";

type Row = {
  applicant_id: string; stage: string; service: string; is_test: boolean;
  first_name: string; last_name: string; intent: number | null;
};
type GhostRow = { archive_reason: string; n: number };

const STAGE_LABEL: Record<string, string> = {
  invited: "Invited", applied: "Applied", proof: "Proof", screen_booked: "Screen booked",
  phone_screened: "Phone screened", referenced: "Referenced", interviewed: "Interviewed",
  agreement: "Agreement", background: "Background", insured: "Insured", active: "Active",
};
const ORDER = ["invited", "applied", "proof", "screen_booked", "phone_screened", "referenced", "interviewed", "agreement", "background", "insured", "active"];

export default function HiringDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [ghost, setGhost] = useState<GhostRow[]>([]);
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: p } = await supabase.from("contractor_pipeline")
      .select("applicant_id, stage, service, is_test, archived, applicants(first_name, last_name)")
      .eq("archived", false);
    const list: Row[] = [];
    const f: Record<string, number> = {};
    for (const r of p ?? []) {
      const rec = r as unknown as { applicant_id: string; stage: string; service: string; is_test: boolean; applicants: { first_name: string; last_name: string } | null };
      if (rec.is_test) continue;
      f[rec.stage] = (f[rec.stage] ?? 0) + 1;
      let intent: number | null = null;
      if (["interviewed", "agreement", "background", "insured"].includes(rec.stage)) {
        const { data: fr } = await supabase.rpc("hiring_fit_report", { _id: rec.applicant_id });
        intent = typeof (fr as { intent?: number })?.intent === "number" ? (fr as { intent: number }).intent : null;
      }
      list.push({
        applicant_id: rec.applicant_id, stage: rec.stage, service: rec.service, is_test: rec.is_test,
        first_name: rec.applicants?.first_name ?? "", last_name: rec.applicants?.last_name ?? "", intent,
      });
    }
    list.sort((a, b) => (b.intent ?? -1) - (a.intent ?? -1));
    setRows(list);
    setFunnel(f);
    const { data: g } = await supabase.from("contractor_pipeline").select("archive_reason").eq("archived", true).not("archive_reason", "is", null);
    const counts: Record<string, number> = {};
    for (const r of g ?? []) counts[(r as { archive_reason: string }).archive_reason] = (counts[(r as { archive_reason: string }).archive_reason] ?? 0) + 1;
    setGhost(Object.entries(counts).map(([archive_reason, n]) => ({ archive_reason, n })));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const activeByService = rows.filter((r) => ["background", "insured", "active"].includes(r.stage))
    .reduce<Record<string, number>>((m, r) => ({ ...m, [r.service]: (m[r.service] ?? 0) + 1 }), {});

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Hiring</h1>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-2">Seats (one Pro per service until 30 reservations)</h2>
        <div className="flex gap-4">
          {["cleaning", "lawn", "car_care"].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className="text-sm text-foreground capitalize">{s.replace("_", " ")}</span>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${(activeByService[s] ?? 0) > 0 ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                {(activeByService[s] ?? 0) > 0 ? "filled" : "open"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-3">Funnel</h2>
        <div className="flex flex-wrap gap-2">
          {ORDER.map((s) => (
            <span key={s} className="text-xs px-2 py-1 rounded-full bg-muted text-foreground">{STAGE_LABEL[s]}: {funnel[s] ?? 0}</span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-3">Candidates (Intent-sorted)</h2>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No open candidates.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Service</th><th className="py-2 pr-4">Stage</th><th className="py-2 pr-4">Intent</th><th className="py-2">Fit Report</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.applicant_id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-foreground">{r.first_name} {r.last_name}</td>
                    <td className="py-2 pr-4 text-foreground capitalize">{r.service?.replace("_", " ")}</td>
                    <td className="py-2 pr-4 text-foreground">{STAGE_LABEL[r.stage] ?? r.stage}</td>
                    <td className="py-2 pr-4 font-semibold text-foreground">{r.intent ?? "—"}</td>
                    <td className="py-2"><Link className="text-primary underline" to={`/admin/hiring/fit/${r.applicant_id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Ghost report (auto-archived)</h2>
        {ghost.length === 0 ? <p className="text-sm text-muted-foreground">Nobody auto-archived yet.</p> : (
          <div className="flex flex-wrap gap-2">
            {ghost.map((g) => (
              <span key={g.archive_reason} className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800">{g.archive_reason}: {g.n}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
