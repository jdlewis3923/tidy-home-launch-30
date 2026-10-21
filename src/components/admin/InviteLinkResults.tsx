/** Who used the application link we texted them: submitted / started but stopped / never started. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { inviteLinkStatus, type InviteLinkStatus } from "@/lib/admin-report-rules";

type Row = { id: string; name: string; status: InviteLinkStatus; answers: number; last: string | null; submitted: string | null; archived: boolean };
const et = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
const ORDER: InviteLinkStatus[] = ["submitted", "started", "not_started"];
const LABEL: Record<InviteLinkStatus, string> = { submitted: "Submitted through the link", started: "Opened the link and started, did NOT submit", not_started: "Never started (0 answers)" };

export default function InviteLinkResults() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("contractor_pipeline")
        .select("applicant_id, apply_submitted_at, archived, archive_reason, is_test, applicants(first_name, last_name, source, is_test_row)")
        .not("apply_resume_token", "is", null).eq("is_test", false);
      const list = (data ?? []).filter((p) => p.applicants?.first_name?.trim() && !p.applicants?.is_test_row && (p.applicants?.source === "indeed") && p.archive_reason !== "removed by Justin");
      const ids = list.map((p) => p.applicant_id);
      const { data: ans } = ids.length ? await supabase.from("application_answers").select("candidate_id, answered_at").in("candidate_id", ids) : { data: [] };
      const agg = new Map<string, { n: number; last: string | null }>();
      for (const a of ans ?? []) { const c = agg.get(a.candidate_id) ?? { n: 0, last: null }; c.n++; if (!c.last || a.answered_at > c.last) c.last = a.answered_at; agg.set(a.candidate_id, c); }
      setRows(list.map((p) => {
        const g = agg.get(p.applicant_id) ?? { n: 0, last: null };
        return { id: p.applicant_id, name: `${p.applicants?.first_name ?? ""} ${p.applicants?.last_name ?? ""}`.trim(), answers: g.n, last: g.last, submitted: p.apply_submitted_at, archived: !!p.archived,
          status: inviteLinkStatus({ apply_submitted_at: p.apply_submitted_at, answers: g.n }) };
      }));
    })();
  }, []);
  if (!rows.length) return null;
  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">Application link we texted · {rows.length} people</div>
      {ORDER.map((s) => {
        const group = rows.filter((r) => r.status === s);
        return (
          <div key={s} className="mb-3">
            <div className={`text-xs font-bold mb-1 ${s === "submitted" ? "text-primary" : "text-foreground"}`}>{LABEL[s]} · {group.length}</div>
            <ul className="space-y-1">
              {group.length === 0 && <li className="text-xs text-muted-foreground">Nobody.</li>}
              {group.map((r) => (
                <li key={r.id}>
                  <Link to={`/admin/pipeline/${r.id}`} className={`block rounded-md border px-3 py-1.5 text-sm ${s === "started" ? "border-accent bg-accent/15" : "border-border bg-background"}`}>
                    <span className="font-semibold text-foreground">{r.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {s === "submitted" && r.submitted ? `Submitted ${et(r.submitted)}` : s === "started" ? `${r.answers} questions answered · last answer ${r.last ? et(r.last) : ""}` : "Has not answered anything"}
                      {r.archived ? " · Closed after the deadline" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
