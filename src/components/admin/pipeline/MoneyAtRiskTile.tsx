/** Dashboard tile: money spent on candidates still in the pipeline, by service, plus recent overrides. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { money, serviceLabel, stageLabel } from "@/lib/pipeline";

export default function MoneyAtRiskTile() {
  const [rows, setRows] = useState<{ service: string; spend_cents: number }[]>([]);
  const [ovs, setOvs] = useState<any[]>([]);
  useEffect(() => {
    const db = supabase as any;
    db.rpc("pipeline_money_at_risk").then(({ data }: any) => setRows(data ?? []));
    db.from("contractor_stage_events").select("id,applicant_id,from_stage,to_stage,reason,created_at").eq("kind", "override")
      .order("created_at", { ascending: false }).limit(5).then(({ data }: any) => setOvs(data ?? []));
  }, []);
  const total = rows.reduce((s, r) => s + Number(r.spend_cents), 0);
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <Link to="/admin/pipeline?from=background" className="block">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Money at risk</h2>
        <p className="mt-1 text-2xl font-black tabular-nums text-foreground">{money(total)}</p>
        <ul className="mt-2 space-y-0.5 text-sm">{rows.map((r) => <li key={r.service} className="flex justify-between"><span>{serviceLabel(r.service)}</span><span className="tabular-nums">{money(Number(r.spend_cents))}</span></li>)}</ul>
      </Link>
      {ovs.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <h3 className="text-xs font-bold uppercase text-muted-foreground">Recent overrides</h3>
          <ul className="mt-1 space-y-0.5 text-xs">{ovs.map((o) => (
            <li key={o.id}><Link className="text-primary" to={`/admin/pipeline/${o.applicant_id}`}>{stageLabel(o.from_stage)} → {stageLabel(o.to_stage)}</Link> — {o.reason}</li>))}</ul>
        </div>
      )}
    </section>
  );
}
