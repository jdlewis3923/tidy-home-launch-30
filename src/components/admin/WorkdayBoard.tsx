/** Workday's two columns: Waiting on me / Waiting on them. Driven by applicants.sequence_stage. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { candidateSource, candidateSubmission, visibleCandidate } from "@/lib/admin-report-rules";
import RedoTasks from "./RedoTasks";
import ReservationTasks from "./ReservationTasks";
import { STAGE_INFO, NEXT_ACTION, type SequenceStage } from "@/lib/onboardingSequence";

type Row = { id: string; first_name: string | null; last_name: string | null; sequence_stage: SequenceStage; sequence_stage_entered_at: string | null; source: string | null; apply_submitted_at: string | null };

const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0);

export default function WorkdayBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from("contractor_pipeline")
        .select("applicant_id, stage, stage_entered_at, source, apply_submitted_at, archived, is_test, applicants(first_name, last_name, source, is_test_row)")
        .eq("archived", false).eq("is_test", false).not("stage", "in", "(declined,active,cold)");
      if (error) return;
      setRows((data ?? []).filter((p) => visibleCandidate(p)).map((p) => ({
        id: p.applicant_id, first_name: p.applicants?.first_name ?? null, last_name: p.applicants?.last_name ?? null,
        sequence_stage: p.stage as SequenceStage, sequence_stage_entered_at: p.stage_entered_at,
        source: p.source ?? p.applicants?.source ?? null, apply_submitted_at: p.apply_submitted_at,
      })));
    };
    void load();
    const channel = supabase.channel("workday-candidate-status").on("postgres_changes", { event: "*", schema: "public", table: "contractor_pipeline" }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);
  const col = (who: "you" | "them") => rows
    .filter((r) => (who === "you" ? (r.sequence_stage === "applied" ? !!r.apply_submitted_at : STAGE_INFO[r.sequence_stage]?.waitingOn === "you") : (r.sequence_stage === "applied" ? !r.apply_submitted_at : ["them", "auto"].includes(STAGE_INFO[r.sequence_stage]?.waitingOn))))
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
              <Link to={`/admin/pipeline/${r.id}`} className={`block rounded-md border px-3 py-2 text-sm ${stalled ? "border-accent bg-accent/15" : "border-border bg-background"}`}>
                <span className="font-semibold text-foreground">{r.first_name} {r.last_name?.[0] ?? ""}.</span>
                <span className="text-muted-foreground"> · {r.sequence_stage === "applied" ? candidateSubmission(r) : STAGE_INFO[r.sequence_stage]?.label ?? r.sequence_stage}</span>
                <span className="block text-[11px] text-muted-foreground">Recruited from: {candidateSource(r.source)}{r.apply_submitted_at ? ` · Submitted ${new Date(r.apply_submitted_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET` : " · Awaiting Tidy application"}</span>
                {NEXT_ACTION[r.sequence_stage] && title.startsWith("Waiting on me") && <span className="block text-[11px] text-primary">Next: {NEXT_ACTION[r.sequence_stage]?.label}</span>}
                <span className={`block text-[11px] ${stalled ? "text-accent-foreground font-semibold" : "text-muted-foreground"}`}>{d} day{d === 1 ? "" : "s"} at this stage</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
    <RedoTasks />
    <ReservationTasks />
    <div className="flex flex-wrap gap-4 px-5 py-4 border-b border-border">
      <Col title="Waiting on me" list={col("you")} />
      <Col title="Waiting on them" list={col("them")} />
    </div>
    </>
  );
}
