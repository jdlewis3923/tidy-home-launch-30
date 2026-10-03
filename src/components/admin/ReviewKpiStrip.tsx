/** Reviews as a growth metric: total, per 100 active members, review bonus paid. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type K = { total_reviews: number; active_members: number; reviews_per_100: number | null; review_bonus_cents: number };

export default function ReviewKpiStrip() {
  const [k, setK] = useState<K | null>(null);
  useEffect(() => { void supabase.rpc("review_kpis").then(({ data }) => setK((data as K) ?? null)); }, []);
  const tiles = [
    ["Total reviews", k ? String(k.total_reviews) : "—"],
    ["Reviews per 100 active members", k?.reviews_per_100 != null ? String(k.reviews_per_100) : "—"],
    ["Review bonus paid", k ? `$${(k.review_bonus_cents / 100).toFixed(0)}` : "—"],
  ];
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-6" data-testid="review-kpis">
      <h2 className="text-sm font-bold text-foreground">Reviews · growth</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="mt-1 text-2xl font-black text-foreground">{v}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
