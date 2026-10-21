/**
 * SMS Outbox — /admin/hiring/outbox (hiring v5 dry-run)
 * Every text that would have been sent while dry-run is on (plus queued ones).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type OutboxRow = {
  id: string; to_phone_e164: string; body: string | null; template_name: string | null;
  status: string; created_at: string; triggered_by: string | null;
};

export default function HiringOutbox() {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("sms_outbox")
      .select("id, to_phone_e164, body, template_name, status, created_at, triggered_by")
      .order("created_at", { ascending: false })
      .limit(100);
    setRows((data as OutboxRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">SMS Outbox</h1>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here yet. Turn on SMS dry-run and run the hiring checks — every text lands here.</p> : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <div key={r.id} className="min-w-0 rounded-lg border border-border bg-card px-4 py-3 [overflow-wrap:anywhere]">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span>→ {r.to_phone_e164}</span>
                {r.template_name ? <span>· {r.template_name}</span> : null}
                <span className={`ml-auto font-semibold px-2 py-0.5 rounded-full ${r.status === "dry_run" ? "bg-amber-100 text-amber-800" : r.status === "sent" ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>{r.status}</span>
              </div>
              {r.body ? <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{r.body}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
