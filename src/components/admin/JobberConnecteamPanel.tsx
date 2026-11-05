import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type ProRow = { service_line: string; connecteam_user_id: number | null; pro_name: string | null };
const LABEL: Record<string, string> = { cleaning: "House Cleaning", lawn: "Lawn Care", detailing: "Car Care" };

/** Jobber reconnect + service → Connecteam Pro mapping + this week's payout lines. */
export default function JobberConnecteamPanel() {
  const [rows, setRows] = useState<ProRow[]>([]);
  const [owed, setOwed] = useState<{ count: number; cents: number }>({ count: 0, cents: 0 });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("jobber_service_pros").select("service_line, connecteam_user_id, pro_name").order("service_line");
    setRows((data ?? []) as ProRow[]);
    const { data: lines } = await supabase.from("pro_payout_lines").select("pay_cents").eq("status", "owed").eq("is_test", false);
    setOwed({ count: lines?.length ?? 0, cents: (lines ?? []).reduce((s, l) => s + (l.pay_cents ?? 0), 0) });
  };
  useEffect(() => { void load(); }, []);

  const reconnect = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("jobber-authorize-url", { body: {} });
    setBusy(false);
    if (error || !data?.url) { toast({ title: "Could not open Jobber sign-in", description: error?.message ?? "No link returned" }); return; }
    window.location.href = data.url;
  };

  const save = async (r: ProRow) => {
    const { error } = await supabase.from("jobber_service_pros").update({
      connecteam_user_id: r.connecteam_user_id || null, pro_name: r.pro_name || null, updated_at: new Date().toISOString(),
    }).eq("service_line", r.service_line);
    toast({ title: error ? "Not saved" : "Saved", description: error?.message ?? `${LABEL[r.service_line] ?? r.service_line} Pro updated` });
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Jobber schedule → Connecteam</h2>
            <p className="text-xs text-muted-foreground">Payout lines owed: {owed.count} · ${(owed.cents / 100).toFixed(2)}</p>
          </div>
          <Button size="sm" onClick={reconnect} disabled={busy} className="ml-auto bg-gold hover:bg-gold/90 text-gold-foreground font-semibold">
            Reconnect Jobber
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {rows.map((r, i) => (
            <div key={r.service_line} className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-sm font-semibold text-foreground">{LABEL[r.service_line] ?? r.service_line}</p>
              <input aria-label="Pro name" className="w-full rounded border border-input bg-background px-2 py-1 text-sm" placeholder="Pro name (empty = open shift)"
                value={r.pro_name ?? ""} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, pro_name: e.target.value } : x))} />
              <input aria-label="Connecteam user ID" inputMode="numeric" className="w-full rounded border border-input bg-background px-2 py-1 text-sm" placeholder="Connecteam user ID"
                value={r.connecteam_user_id ?? ""} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, connecteam_user_id: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null } : x))} />
              <Button size="sm" variant="secondary" onClick={() => save(rows[i])}>Save</Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
