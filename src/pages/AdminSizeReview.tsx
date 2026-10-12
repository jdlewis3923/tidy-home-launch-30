/**
 * /admin/size-review — first-visit size mismatches. "Notify customer" prices the
 * right size on the member's own rate card and asks them to confirm; nothing is
 * charged until they do.
 */
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { toast } from "@/hooks/use-toast";

const money = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);

export default function AdminSizeReview() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const qc = useQueryClient();
  const [size, setSize] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["size_reviews_admin"], enabled: !!hasRole,
    queryFn: async () => (await supabase.from("size_reviews").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Loading…</main>;
  if (!hasRole) return <Navigate to="/login" replace />;

  const notify = async (id: string, booked: number) => {
    const n = parseInt(size[id] ?? String(booked + 1), 10);
    const { data, error } = await supabase.rpc("admin_size_review_notify", { _review: id, _new_size: n, _note: note[id] ?? null });
    if (error) { toast({ title: "Not sent", description: error.message, variant: "destructive" }); return; }
    const r = data as { old_monthly_cents: number; new_monthly_cents: number; rate_card_version: number };
    toast({ title: "Customer asked to confirm", description: `${money(r.old_monthly_cents)} → ${money(r.new_monthly_cents)} on rate card v${r.rate_card_version}.` });
    void qc.invalidateQueries({ queryKey: ["size_reviews_admin"] });
  };

  const rows = q.data ?? [];
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Size review</h1>
        <p className="mt-1 text-sm text-muted-foreground">When a Pro finds a bigger home or vehicle than booked. The customer confirms the new price or cancels. Founding members are priced on their own rate card.</p>
      </header>
      {!rows.length && <p className="text-sm text-muted-foreground">No size mismatches yet.</p>}
      {rows.map((r) => (
        <section key={r.id} className="rounded-xl border border-border bg-card p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-bold text-foreground">{r.service} · booked size {r.booked_size} · {r.matches ? "matches" : "mismatch"}</p>
            <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-semibold text-foreground">{r.status}</span>
          </div>
          <p className="mt-1 text-muted-foreground">
            Pro saw: {r.service === "cleaning" ? `${r.observed_bedrooms ?? "?"} bed / ${r.observed_bathrooms ?? "?"} bath` : `${r.observed_vehicle_class ?? "?"}${r.observed_plate ? ` · plate ${r.observed_plate}` : ""}`}
            {" · "}{new Date(r.created_at).toLocaleString()}
          </p>
          {r.status !== "open" && <p className="mt-1 text-muted-foreground">Price {money(r.old_monthly_cents)} → {money(r.new_monthly_cents)} · rate card v{r.rate_card_version ?? "—"}{r.customer_responded_at ? ` · customer answered ${new Date(r.customer_responded_at).toLocaleDateString()}` : ""}</p>}
          {r.status === "open" && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label>New size
                <select value={size[r.id] ?? String(Math.min(3, r.booked_size + 1))} onChange={(e) => setSize({ ...size, [r.id]: e.target.value })} className="ml-2 rounded border border-input bg-background p-1.5">
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <input placeholder="Note (optional)" value={note[r.id] ?? ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} className="flex-1 rounded border border-input bg-background p-1.5" />
              <button type="button" onClick={() => void notify(r.id, r.booked_size)} className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">Ask customer to confirm</button>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
