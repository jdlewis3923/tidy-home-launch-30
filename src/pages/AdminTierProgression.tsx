/**
 * /admin/tier-progression — operational 3-column dashboard for the
 * Tidy Tier 1 → Tier 2 promotion pipeline.
 *
 *   Eligible Now            Offered · Awaiting COI         Recently Promoted
 *
 * Live data from the applicants table. Click a card to open the
 * applicant in /admin/applicants?id=…
 */
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Award, ShieldCheck, FileWarning, ArrowUpRight, Loader2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  tier: string | null;
  tier_readiness_status: string | null;
  tier_offer_sent_at: string | null;
  tier_advanced_at: string | null;
  coi_review_status: string | null;
  completed_visits: number | null;
  avg_customer_rating: number | null;
};

const SEL = "id,first_name,last_name,email,tier,tier_readiness_status,tier_offer_sent_at,tier_advanced_at,coi_review_status,completed_visits,avg_customer_rating";

function relTime(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(diff / 3600000);
  if (h > 0) return `${h}h ago`;
  return "just now";
}

export default function AdminTierProgression() {
  const [eligible, setEligible] = useState<Row[]>([]);
  const [offered, setOffered] = useState<Row[]>([]);
  const [promoted, setPromoted] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [e, o, p] = await Promise.all([
      supabase.from("applicants").select(SEL)
        .eq("current_stage", "active").eq("tier", "tier_1_verified")
        .eq("tier_readiness_status", "eligible").order("updated_at", { ascending: false }),
      supabase.from("applicants").select(SEL)
        .eq("tier_readiness_status", "offered").neq("coi_review_status", "approved")
        .order("tier_offer_sent_at", { ascending: false }),
      supabase.from("applicants").select(SEL)
        .eq("tier", "tier_2_pro_partner")
        .order("tier_advanced_at", { ascending: false }).limit(25),
    ]);
    setEligible((e.data ?? []) as Row[]);
    setOffered((o.data ?? []) as Row[]);
    setPromoted((p.data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-tier-prog")
      .on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="min-h-screen pl-0 md:pl-20 pt-12">
      <Helmet><title>Tier Progression — Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[hsl(var(--gold))]">Pro Pipeline</p>
          <h1 className="font-display text-3xl font-bold text-white">Tier Progression</h1>
          <p className="mt-1 text-sm text-slate-300">Live view of the Tier 1 → Tier 2 funnel. Updates in realtime as visits, ratings, and COI status change.</p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-300"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading pipeline…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Column title="Eligible Now" tone="emerald" icon={<ShieldCheck className="h-4 w-4" />} rows={eligible}
              empty="No Pros currently meet all six criteria." render={(r) => (
                <span className="text-[11px] text-emerald-300">{r.completed_visits ?? 0} visits · {(r.avg_customer_rating ?? 0).toFixed(1)}★</span>
              )} />
            <Column title="Offered · Awaiting COI" tone="gold" icon={<FileWarning className="h-4 w-4" />} rows={offered}
              empty="No outstanding offers." render={(r) => (
                <span className="text-[11px] text-amber-300">offered {relTime(r.tier_offer_sent_at)}</span>
              )} />
            <Column title="Recently Promoted" tone="blue" icon={<Award className="h-4 w-4" />} rows={promoted}
              empty="No promotions yet." render={(r) => (
                <span className="text-[11px] text-blue-300 inline-flex items-center gap-1"><Star className="h-3 w-3" /> Tier 2 · {relTime(r.tier_advanced_at)}</span>
              )} />
          </div>
        )}
      </div>
    </div>
  );
}

function Column({ title, tone, icon, rows, empty, render }: {
  title: string; tone: "emerald" | "gold" | "blue"; icon: React.ReactNode;
  rows: Row[]; empty: string; render: (r: Row) => React.ReactNode;
}) {
  const ring = tone === "emerald" ? "ring-emerald-500/30" : tone === "gold" ? "ring-amber-400/40" : "ring-blue-400/30";
  const dot = tone === "emerald" ? "bg-emerald-400" : tone === "gold" ? "bg-amber-300" : "bg-blue-300";
  return (
    <Card className={`bg-slate-900/60 border-slate-800 ring-1 ${ring} backdrop-blur`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-white">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {icon}
            <h2 className="font-semibold tracking-tight">{title}</h2>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">{empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/admin/applicants?id=${r.id}`}
                  className="group flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-slate-950/40 hover:bg-slate-800/60 transition border border-transparent hover:border-slate-700">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{r.first_name} {r.last_name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{r.email}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {render(r)}
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-white" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
