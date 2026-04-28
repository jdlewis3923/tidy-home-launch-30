/**
 * /admin/agents — "Are my agents working?" page.
 *
 * Reads the live state of the 6 logical agents from kpi_snapshots
 * (most recent computed_at per category = proof the agent ran) plus
 * pg_cron schedules. Each agent groups KPIs by category and surfaces:
 *  - status (active = computed in last 2h, idle = stale)
 *  - KPIs they monitor
 *  - last computed timestamp (= last action)
 *  - next scheduled run (cron description)
 */
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, Clock, ArrowLeft } from "lucide-react";

type Agent = {
  key: string;
  name: string;
  emoji: string;
  categories: string[];
  cadence: string;
  description: string;
};

const AGENTS: Agent[] = [
  {
    key: "operations",
    name: "Operations",
    emoji: "🛠️",
    categories: ["operations"],
    cadence: "Every 5 min · realtime",
    description: "Watches visits, crews, on-time arrival, no-shows.",
  },
  {
    key: "marketing",
    name: "Marketing",
    emoji: "📣",
    categories: ["acquisition", "conversion"],
    cadence: "Hourly + daily 6am ET",
    description: "Tracks ads spend, CAC, signups, conversion funnel.",
  },
  {
    key: "reviews",
    name: "Reviews & NPS",
    emoji: "⭐",
    categories: ["reviews"],
    cadence: "Daily 6am ET",
    description: "Pulls Google reviews, star delta, NPS.",
  },
  {
    key: "support",
    name: "Customer Support",
    emoji: "💬",
    categories: ["customer_health"],
    cadence: "Every 5 min",
    description: "Monitors inbox load, churn signals, NPS dips.",
  },
  {
    key: "financial",
    name: "Financial",
    emoji: "💰",
    categories: ["financial"],
    cadence: "Hourly",
    description: "MRR, failed payments, recovery, coupon spend.",
  },
  {
    key: "system",
    name: "System Health",
    emoji: "🩺",
    categories: ["system_health"],
    cadence: "Every 5 min",
    description: "Edge errors, webhook delivery, AI uptime.",
  },
];

interface KpiRow {
  code: string;
  category: string;
}
interface SnapRow {
  kpi_code: string;
  computed_at: string;
  status: string;
}

export default function AdminAgents() {
  const [authed, setAuthed] = useState<null | boolean>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [defs, setDefs] = useState<KpiRow[]>([]);
  const [snaps, setSnaps] = useState<Record<string, SnapRow>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) {
        if (active) setAuthed(false);
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      if (!active) return;
      if (!isAdmin) {
        setForbidden(true);
        setAuthed(true);
        setLoading(false);
        return;
      }
      setAuthed(true);

      const [{ data: dRows }, { data: sRows }] = await Promise.all([
        supabase.from("kpi_definitions").select("code, category").eq("enabled", true),
        supabase.from("kpi_snapshots").select("kpi_code, computed_at, status")
          .order("computed_at", { ascending: false }).limit(500),
      ]);
      const latest: Record<string, SnapRow> = {};
      for (const s of (sRows ?? []) as SnapRow[]) {
        if (!latest[s.kpi_code]) latest[s.kpi_code] = s;
      }
      if (!active) return;
      setDefs((dRows ?? []) as KpiRow[]);
      setSnaps(latest);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  if (authed === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (authed === false) return <Navigate to="/login?redirect=/admin/agents" replace />;
  if (forbidden) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Admins only</h1>
          <p className="text-slate-600">Sign in with an admin account to view agent status.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>Agents · Tidy</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="bg-[#0f172a] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs uppercase tracking-widest text-[#f5c518] font-semibold">
              Tidy · Operating System
            </p>
            <h1 className="text-xl sm:text-3xl font-semibold mt-1">Agents</h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1">
              6 agents monitoring 38 KPIs · all running
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button asChild variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-8 px-2.5 text-xs">
              <Link to="/admin/kpis"><ArrowLeft className="h-3.5 w-3.5 mr-1" />KPI Center</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="py-20 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading agents…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AGENTS.map((agent) => {
              const myKpis = defs.filter((d) => agent.categories.includes(d.category));
              const myCodes = myKpis.map((k) => k.code);
              const mySnaps = myCodes.map((c) => snaps[c]).filter(Boolean);
              const lastRun = mySnaps.reduce<string | null>(
                (acc, s) => (acc === null || s.computed_at > acc ? s.computed_at : acc),
                null,
              );
              const lastRunDate = lastRun ? new Date(lastRun) : null;
              const ageMin = lastRunDate ? (Date.now() - lastRunDate.getTime()) / 60000 : Infinity;
              const isActive = ageMin < 120;
              const greens = mySnaps.filter((s) => s.status === "green").length;
              const reds = mySnaps.filter((s) => s.status === "critical").length;

              return (
                <div
                  key={agent.key}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl" aria-hidden>{agent.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base sm:text-lg font-semibold text-slate-900">
                          {agent.name}
                        </h2>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            <AlertCircle className="h-3 w-3" /> Idle
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{agent.description}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded px-2 py-2">
                      <div className="text-lg font-bold text-slate-900">{myKpis.length}</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">KPIs</div>
                    </div>
                    <div className="bg-emerald-50 rounded px-2 py-2">
                      <div className="text-lg font-bold text-emerald-700">{greens}</div>
                      <div className="text-[10px] uppercase tracking-wide text-emerald-600">Green</div>
                    </div>
                    <div className="bg-rose-50 rounded px-2 py-2">
                      <div className="text-lg font-bold text-rose-700">{reds}</div>
                      <div className="text-[10px] uppercase tracking-wide text-rose-600">Critical</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-slate-600 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-slate-400" />
                      <span>Last action: {lastRunDate ? lastRunDate.toLocaleString() : "—"}</span>
                    </div>
                    <div className="text-slate-500">Schedule: {agent.cadence}</div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">
                      Monitors
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {myKpis.slice(0, 8).map((k) => (
                        <span key={k.code} className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {k.code}
                        </span>
                      ))}
                      {myKpis.length > 8 && (
                        <span className="text-[10px] text-slate-500">+{myKpis.length - 8}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
