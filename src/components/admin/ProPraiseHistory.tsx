/** Good feedback forwarded to this Pro (praise only — negative feedback never auto-forwards). */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type P = { id: string; message: string; stars: number | null; sms_status: string; created_at: string };

export default function ProPraiseHistory({ applicantId }: { applicantId: string }) {
  const [rows, setRows] = useState<P[]>([]);
  useEffect(() => {
    void supabase.from("pro_praise").select("id, message, stars, sms_status, created_at").eq("applicant_id", applicantId)
      .order("created_at", { ascending: false }).limit(20).then(({ data }) => setRows((data ?? []) as P[]));
  }, [applicantId]);
  return (
    <div className="rounded-lg border border-border bg-card p-3" data-testid="pro-praise-history">
      <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">Good feedback · {rows.length}</div>
      {rows.length === 0 ? <p className="text-xs text-muted-foreground">None forwarded yet.</p> : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="text-xs text-foreground">
              <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {r.sms_status === "queued" ? "text queued" : r.sms_status} · </span>{r.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
