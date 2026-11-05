import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type PoolRow = { id?: string; service_line: string; connecteam_user_id: number | null; pro_name: string | null; priority: number };
const SERVICES = ["cleaning", "lawn", "detailing"] as const;
const LABEL: Record<string, string> = { cleaning: "House Cleaning", lawn: "Lawn Care", detailing: "Car Care" };

/**
 * Jobber reconnect + service → Connecteam Pros (in order). Each shift goes to the
 * first Pro without an overlapping shift; if nobody is free it becomes an open shift.
 */
export default function JobberConnecteamPanel() {
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [owed, setOwed] = useState<{ count: number; cents: number }>({ count: 0, cents: 0 });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("jobber_service_pro_pool").select("id, service_line, connecteam_user_id, pro_name, priority").eq("active", true).order("priority");
    setRows((data ?? []) as PoolRow[]);
    const { data: lines } = await supabase.from("pro_pay_lines").select("pay_cents").eq("status", "owed").eq("is_test", false);
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

  const update = (r: PoolRow, patch: Partial<PoolRow>) => setRows(rows.map((x) => (x === r ? { ...x, ...patch } : x)));

  const save = async (r: PoolRow) => {
    if (!r.connecteam_user_id) { toast({ title: "Add the Connecteam user ID" }); return; }
    const row = { service_line: r.service_line, connecteam_user_id: r.connecteam_user_id, pro_name: r.pro_name || null, priority: r.priority, active: true, updated_at: new Date().toISOString() };
    const { error } = r.id
      ? await supabase.from("jobber_service_pro_pool").update(row).eq("id", r.id)
      : await supabase.from("jobber_service_pro_pool").upsert(row, { onConflict: "service_line,connecteam_user_id" });
    toast({ title: error ? "Not saved" : "Saved", description: error?.message });
    if (!error) void load();
  };

  const remove = async (r: PoolRow) => {
    if (r.id) {
      const { error } = await supabase.from("jobber_service_pro_pool").update({ active: false }).eq("id", r.id);
      if (error) { toast({ title: "Not removed", description: error.message }); return; }
    }
    void load();
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Jobber schedule → Connecteam</h2>
            <p className="text-xs text-muted-foreground">Pay lines owed: {owed.count} · ${(owed.cents / 100).toFixed(2)} · Shifts go to #1 unless busy, then #2, and so on.</p>
          </div>
          <Button size="sm" onClick={reconnect} disabled={busy} className="ml-auto bg-gold hover:bg-gold/90 text-gold-foreground font-semibold">
            Reconnect Jobber
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {SERVICES.map((svc) => {
            const list = rows.filter((r) => r.service_line === svc).sort((a, b) => a.priority - b.priority);
            return (
              <div key={svc} className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-sm font-semibold text-foreground">{LABEL[svc]}</p>
                {list.length === 0 && <p className="text-xs text-muted-foreground">No Pro — visits become open shifts.</p>}
                {list.map((r, i) => (
                  <div key={r.id ?? `new-${i}`} className="space-y-1 rounded border border-border p-2">
                    <div className="flex items-center gap-2">
                      <input aria-label="Order" inputMode="numeric" className="w-10 rounded border border-input bg-background px-1 py-1 text-sm" value={r.priority}
                        onChange={(e) => update(r, { priority: Number(e.target.value.replace(/\D/g, "")) || 1 })} />
                      <input aria-label="Pro name" className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm" placeholder="Pro name"
                        value={r.pro_name ?? ""} onChange={(e) => update(r, { pro_name: e.target.value })} />
                    </div>
                    <input aria-label="Connecteam user ID" inputMode="numeric" className="w-full rounded border border-input bg-background px-2 py-1 text-sm" placeholder="Connecteam user ID"
                      value={r.connecteam_user_id ?? ""} onChange={(e) => update(r, { connecteam_user_id: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => save(r)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(r)}>Remove</Button>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setRows([...rows, { service_line: svc, connecteam_user_id: null, pro_name: "", priority: list.length + 1 }])}>Add Pro</Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
