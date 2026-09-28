/** Workday's two columns: Waiting on me / Waiting on them. Driven by applicants.sequence_stage. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { STAGE_INFO, NEXT_ACTION, type SequenceStage } from "@/lib/onboardingSequence";

type Row = { id: string; first_name: string | null; last_name: string | null; sequence_stage: SequenceStage; sequence_stage_entered_at: string | null; is_test_row?: boolean | null };

const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0);

export default function WorkdayBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    void supabase.from("applicants").select("id, first_name, last_name, sequence_stage, sequence_stage_entered_at")
      .not("sequence_stage", "in", "(declined,active,cold)").then(({ data }) => setRows((data ?? []) as Row[]));
  }, []);
  const col = (who: "you" | "them") => rows
    .filter((r) => (who === "you" ? STAGE_INFO[r.sequence_stage]?.waitingOn === "you" : ["them", "auto"].includes(STAGE_INFO[r.sequence_stage]?.waitingOn)))
    .sort((a, b) => days(b.sequence_stage_entered_at) - days(a.sequence_stage_entered_at));

  const Col = ({ title, list }: { title: string; list: Row[] }) => (
    <div className="flex-1 min-w-[240px]">
      <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">{title} · {list.length}</div>
      <ul className="space-y-1.5">
        {list.length === 0 && <li className="text-xs text-muted-foreground">Nobody.</li>}
        {list.map((r) => {
          const d = days(r.sequence_stage_entered_at);
          const stalled = d >= 3;
          return (
            <li key={r.id}>
              <Link to={`/admin/applicants?id=${r.id}`} className={`block rounded-md border px-3 py-2 text-sm ${stalled ? "border-accent bg-accent/15" : "border-border bg-background"}`}>
                <span className="font-semibold text-foreground">{r.first_name} {r.last_name?.[0] ?? ""}.</span>
                <span className="text-muted-foreground"> · {STAGE_INFO[r.sequence_stage]?.label}</span>
                {NEXT_ACTION[r.sequence_stage] && title.startsWith("Waiting on me") && <span className="block text-[11px] text-primary">Next: {NEXT_ACTION[r.sequence_stage]!.label}</span>}
                <span className={`block text-[11px] ${stalled ? "text-accent-foreground font-semibold" : "text-muted-foreground"}`}>{d} day{d === 1 ? "" : "s"} at this stage</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="flex flex-wrap gap-4 px-5 py-4 border-b border-border">
      <Col title="Waiting on me" list={col("you")} />
      <Col title="Waiting on them" list={col("them")} />
    </div>
  );
}
