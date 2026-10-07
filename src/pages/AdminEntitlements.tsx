/** Admin — Free add-on entitlements (/admin/entitlements) and car wash jobs on their own lines. */
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";

type Ent = { id: string; member_id: string; type: string; period: string | null; status: string; chosen_addon: string | null;
  redeemed_at: string | null; granted_at: string };
type Wash = { id: string; visit_date: string; zip: string | null; time_window: string | null; assigned_pro_id: string | null;
  different_day: boolean; customer_first_name: string | null; status: string };

const period = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function AdminEntitlements() {
  const [ents, setEnts] = useState<Ent[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [washes, setWashes] = useState<Wash[]>([]);
  const [cost, setCost] = useState<{ month: string; gifts: number; cost_cents: number }[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("addon_entitlements").select("id, member_id, type, period, status, chosen_addon, redeemed_at, granted_at").order("granted_at", { ascending: false }).limit(1000);
      const list = (data as Ent[]) ?? [];
      setEnts(list);
      const ids = [...new Set(list.map((e) => e.member_id))];
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("user_id, first_name, zip").in("user_id", ids);
        setNames(Object.fromEntries((p ?? []).map((r) => [r.user_id, `${r.first_name ?? "Member"} · ${r.zip ?? ""}`])));
      }
      const { data: w } = await supabase.from("visits").select("id, visit_date, zip, time_window, assigned_pro_id, different_day, customer_first_name, status")
        .eq("visit_kind", "car_wash").gte("visit_date", new Date().toISOString().slice(0, 10)).order("visit_date").order("zip").limit(300);
      setWashes((w as Wash[]) ?? []);
      const { data: c } = await supabase.rpc("admin_gift_cost_by_month");
      setCost(c ?? []);
    })();
  }, []);

  const per = period();
  const unused = ents.filter((e) => e.status === "available" || e.status === "chosen");
  const expiring = unused.filter((e) => e.type === "bundle_monthly" && e.period === per && e.status === "available");
  const soon = (d: string) => (new Date(`${d}T12:00:00`).getTime() - Date.now()) < 48 * 3600_000;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>Free add-ons | Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-6xl space-y-6">
        <div><h1 className="text-2xl font-black tracking-tight text-foreground">Free add-ons</h1>
          <p className="mt-1 text-sm text-muted-foreground">Founding first-visit gifts and monthly bundle gifts. Monthly gifts expire unused at month end.</p></div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Unused right now" value={String(unused.filter((e) => e.status === "available").length)} />
          <Stat label={`Expiring end of ${per}`} value={String(expiring.length)} />
          <Stat label={`Gift cost ${per} (Pro pay)`} value={money(cost.find((c) => c.month === per)?.cost_cents ?? 0)} />
        </div>

        <Table title="Unused entitlements" head={["Member", "Type", "Period", "Status", "Chosen"]}
          rows={unused.map((e) => [names[e.member_id] ?? e.member_id.slice(0, 8), e.type === "founding_first_visit" ? "Founding · first visit" : "Bundle · monthly", e.period ?? "—", e.status, e.chosen_addon ?? "—"])} />

        <Table title="Monthly cost of gifted add-ons (sum of Pro pay on redeemed gifts)" head={["Month", "Gifts redeemed", "Cost"]}
          rows={cost.map((c) => [c.month, String(c.gifts), money(c.cost_cents)])} />

        <Table title="Car wash jobs (own line, by day and ZIP)" head={["Day", "ZIP", "Window", "Member", "Car care Pro", "Flags"]}
          rows={washes.map((w) => [w.visit_date, w.zip ?? "—", w.time_window ?? "—", w.customer_first_name ?? "—",
            w.assigned_pro_id ? "Assigned" : (soon(w.visit_date) ? "UNASSIGNED — within 48h" : "Unassigned"),
            [w.different_day ? "Different day from base visit" : "", w.status !== "scheduled" ? w.status : ""].filter(Boolean).join(" · ") || "—"])} />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black tabular-nums">{value}</p></div>;
}
function Table({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 text-base font-bold">{title}</h2>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{head.map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="px-3 py-4 text-muted-foreground">Nothing here yet.</td></tr>}
          {rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}
        </tbody>
      </table></div>
    </section>
  );
}
