/** Workday's two columns: Waiting on me / Waiting on them. Driven by applicants.sequence_stage. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { visibleCandidate } from "@/lib/admin-report-rules";
import RedoTasks from "./RedoTasks";
import ReservationTasks from "./ReservationTasks";
import InviteLinkResults from "./InviteLinkResults";
import { STAGE_INFO, NEXT_ACTION, type SequenceStage } from "@/lib/onboardingSequence";
import ApplicationChannels from "@/components/admin/ApplicationChannels";
import { useApplicationChannels } from "@/hooks/useApplicationChannels";

type Row = { id: string; first_name: string | null; last_name: string | null; sequence_stage: SequenceStage; sequence_stage_entered_at: string | null; source: string | null; apply_submitted_at: string | null };

const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0);

export default function WorkdayBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const channels = useApplicationChannels(rows.map((r) => r.id));
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

  const Item = ({ r, mine }: { r: Row; mine: boolean }) => {
    const d = days(r.sequence_stage_entered_at);
    const stalled = d >= 3;
    return (
      <li>
        <Link to={`/admin/pipeline/${r.id}`} className={`block rounded-md border px-3 py-2 text-sm ${stalled ? "border-accent bg-accent/15" : "border-border bg-background"}`}>
          <span className="font-semibold text-foreground">{r.first_name}{r.last_name?.trim() ? ` ${r.last_name.trim()[0]}.` : ""}</span>
          {r.sequence_stage !== "applied" && <span className="text-muted-foreground"> · {STAGE_INFO[r.sequence_stage]?.label ?? r.sequence_stage}</span>}
          <ApplicationChannels c={channels.get(r.id)} />
          {NEXT_ACTION[r.sequence_stage] && mine && <span className="block text-[11px] text-primary">Next: {NEXT_ACTION[r.sequence_stage]?.label}</span>}
          <span className={`block text-[11px] ${stalled ? "text-accent-foreground font-semibold" : "text-muted-foreground"}`}>{d} day{d === 1 ? "" : "s"} at this stage</span>
        </Link>
      </li>
    );
  };

  const Col = ({ title, hint, list, mine }: { title: string; hint: string; list: Row[]; mine: boolean }) => {
    const groups = [
      { key: "indeed", label: "Came from INDEED", rows: list.filter((r) => channels.get(r.id)?.origin === "indeed") },
      { key: "website", label: "Applied on TIDY WEBSITE", rows: list.filter((r) => channels.get(r.id)?.origin === "website") },
      { key: "other", label: "Other source", rows: list.filter((r) => { const o = channels.get(r.id)?.origin; return o !== "indeed" && o !== "website"; }) },
    ].filter((g) => g.rows.length);
    return (
      <div className="flex-1 min-w-[260px] rounded-lg border border-border bg-muted/30 p-3">
        <h3 className="text-base font-bold text-foreground">{title} · {list.length}</h3>
        <p className="text-xs text-muted-foreground mb-3">{hint}</p>
        {list.length === 0 && <p className="text-xs text-muted-foreground">Nobody.</p>}
        {groups.map((g) => (
          <div key={g.key} className="mb-3">
            <div className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground mb-1">{g.label} · {g.rows.length}</div>
            <ul className="space-y-1.5">{g.rows.map((r) => <Item key={r.id} r={r} mine={mine} />)}</ul>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
    <div className="flex flex-wrap gap-4 px-5 py-4 border-b border-border">
      <Col title="Waiting on me" hint="You need to do something next." list={col("you")} mine />
      <Col title="Waiting on them" hint="They still need to finish or reply." list={col("them")} mine={false} />
    </div>
    <RedoTasks />
    <ReservationTasks />
    <details className="border-b border-border">
      <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-foreground">Everyone we texted the application link to (tap to open)</summary>
      <InviteLinkResults />
    </details>
    </>
  );
}
