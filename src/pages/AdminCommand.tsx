/**
 * /admin/command — Command tab (default admin landing view).
 *
 * Every number on this page is read from the newest kpi_snapshot row written by
 * the kpi-rollup edge function, plus kpi_plan (the target curve), qr_scan
 * (sparklines), alert_event / alert_rule (feed). No hardcoded readings: when a
 * metric is null the UI renders an em dash + "no data yet".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import {
  CartesianGrid, ComposedChart, Area, Line, ReferenceLine, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useHasRoleState } from "@/hooks/useHasRole";
import { toast } from "@/hooks/use-toast";

// ── types ────────────────────────────────────────────────────────────────────
type Metrics = Record<string, any>;

interface Snapshot {
  id: string;
  captured_at: string;
  window: "am" | "pm" | string;
  metrics: Metrics;
}
interface PlanRow {
  plan_month: number;
  month_label: string;
  cum_profit_planned: number | null;
  subs_planned: number | null;
  pros_required: number | null;
}
interface AlertRule {
  code: string;
  domain: string;
  priority: number;
  title: string;
  action_text: string | null;
  enabled: boolean;
}
interface AlertEvent {
  id: string;
  rule_code: string;
  fired_at: string;
  severity: string;
  headline: string | null;
  detail: string | null;
  metric_value: number | null;
  threshold_value: number | null;
  suppressed_in_digest: boolean;
  status: "open" | "acknowledged" | "resolved" | string;
}
interface NeedsAttentionCustomer {
  subscription_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  monthly_total_cents: number;
  preferred_pro_id: string | null;
  retired_price: boolean;
  missing_pro: boolean;
}

const ZIP_LABELS: Record<string, string> = {
  "33156": "Pinecrest",
  "33183": "Kendall",
  "33186": "Kendall West",
};
const SERVICE_ORDER = ["house_clean", "car_wash", "car_detail"] as const;
const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: "applicant", label: "Applicants" },
  { key: "screened", label: "Screened" },
  { key: "bg_check", label: "Background" },
  { key: "onboarding", label: "Onboarding" },
];
const DOMAIN_ORDER = ["capacity", "profit", "funnel", "trust", "plumbing"];
const YEAR_ONE_TARGET = 150000;

// ── format helpers (null → em dash, never a fake zero) ───────────────────────
const has = (v: unknown) => v !== null && v !== undefined && !Number.isNaN(v as number);

function NoData({ label = "no data yet" }: { label?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-slate-400">—</span>
      <span className="text-[11px] text-slate-400">{label}</span>
    </span>
  );
}
const money = (n: unknown) => {
  if (!has(n)) return null;
  const v = Math.round(Number(n));
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString()}`;
};
const pct = (n: unknown, digits = 1) =>
  has(n) ? `${Number(n).toFixed(digits)}%` : null;
const count = (n: unknown) => (has(n) ? Number(n).toLocaleString() : null);

function Cell({ value }: { value: string | null }) {
  return value === null ? <NoData /> : <>{value}</>;
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function dateLabel(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function AdminCommand() {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [scanSeries, setScanSeries] = useState<Record<string, number[]>>({});
  const [needsAttention, setNeedsAttention] = useState<NeedsAttentionCustomer[]>([]);

  const load = useCallback(async () => {
    setRefreshing(true);
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [snapRes, planRes, ruleRes, evRes, scanRes] = await Promise.all([
      supabase.from("kpi_snapshot").select("id, captured_at, window, metrics").order("captured_at", { ascending: false }).limit(200),
      supabase.from("kpi_plan").select("plan_month, month_label, cum_profit_planned, subs_planned, pros_required").order("plan_month"),
      supabase.from("alert_rule").select("code, domain, priority, title, action_text, enabled"),
      supabase.from("alert_event").select("id, rule_code, fired_at, severity, headline, detail, metric_value, threshold_value, suppressed_in_digest, status").order("fired_at", { ascending: false }).limit(200),
      supabase.from("qr_scan").select("zip, scanned_at").gte("scanned_at", since),
    ]);

    const snaps = (snapRes.data ?? []) as unknown as Snapshot[];
    setHistory(snaps);
    setSnap(snaps[0] ?? null);
    setPlan((planRes.data ?? []) as unknown as PlanRow[]);
    setRules((ruleRes.data ?? []) as unknown as AlertRule[]);
    setEvents((evRes.data ?? []) as unknown as AlertEvent[]);

    // Daily scan counts per ZIP for the trailing 30 days.
    const series: Record<string, number[]> = {};
    const dayIndex = (iso: string) =>
      29 - Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
    for (const zip of Object.keys(ZIP_LABELS)) series[zip] = new Array(30).fill(0);
    series.total = new Array(30).fill(0);
    for (const row of (scanRes.data ?? []) as { zip: string | null; scanned_at: string }[]) {
      const i = dayIndex(row.scanned_at);
      if (i < 0 || i > 29) continue;
      if (row.zip && series[row.zip]) series[row.zip][i] += 1;
      series.total[i] += 1;
    }
    setScanSeries(series);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (hasRole) void load();
  }, [hasRole, load]);

  const m = snap?.metrics ?? {};
  const profit = (m.profit ?? {}) as Metrics;
  const capacity = (m.capacity ?? {}) as Metrics;
  const funnel = (m.funnel ?? {}) as Metrics;
  const trust = (m.trust ?? {}) as Metrics;
  const composites = (m.composites ?? {}) as Metrics;

  // Actual cumulative-profit curve: newest snapshot per plan month.
  const chartData = useMemo(() => {
    const actualByMonth = new Map<number, number>();
    for (const s of [...history].reverse()) {
      const p = (s.metrics?.profit ?? {}) as Metrics;
      if (has(p.plan_month) && has(p.cum_profit_actual)) {
        actualByMonth.set(Number(p.plan_month), Number(p.cum_profit_actual));
      }
    }
    return plan.map((row) => {
      const actual = actualByMonth.has(row.plan_month) ? actualByMonth.get(row.plan_month)! : null;
      const planned = has(row.cum_profit_planned) ? Number(row.cum_profit_planned) : null;
      return {
        month: row.month_label,
        planned,
        actual,
        gap: actual !== null && planned !== null ? [Math.min(actual, planned), Math.max(actual, planned)] : null,
      };
    });
  }, [plan, history]);

  const ruleByCode = useMemo(
    () => Object.fromEntries(rules.map((r) => [r.code, r])) as Record<string, AlertRule>,
    [rules],
  );

  const updateEvent = async (id: string, status: "acknowledged" | "resolved") => {
    const now = new Date().toISOString();
    const patch =
      status === "resolved" ? { status, resolved_at: now } : { status, acknowledged_at: now };
    const { error } = await supabase.from("alert_event").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Could not update alert", description: error.message, variant: "destructive" });
      return;
    }
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!hasRole) return <Navigate to="/" replace />;

  // ── status line ───────────────────────────────────────────────────────────
  const delta = has(profit.plan_delta_dollars) ? Number(profit.plan_delta_dollars) : null;
  const daysOff = has(profit.days_behind_plan) ? Number(profit.days_behind_plan) : null;
  let statusText = "AWAITING FIRST ROLLUP";
  let statusTone = "text-slate-500";
  if (delta !== null) {
    if (Math.abs(delta) < 500) {
      statusText = "ON TRACK";
      statusTone = "text-emerald-600";
    } else if (delta > 0) {
      statusText = `AHEAD ${Math.round(delta).toLocaleString()} dollars`;
      statusTone = "text-blue-600";
    } else {
      statusText = `BEHIND ${Math.round(Math.abs(delta)).toLocaleString()} dollars${
        daysOff !== null ? ` — ${Math.abs(Math.round(daysOff))} days` : ""
      }`;
      statusTone = "text-rose-600";
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>Command · Tidy Admin</title>
        <meta name="description" content="Tidy command center: profit versus plan, capacity runway, ZIP funnel, alerts and trust metrics." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="bg-[#0f172a] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold">Command</h1>
            <p className="text-xs text-white/60">Newest rollup drives every number on this page.</p>
          </div>
          <nav className="ml-auto flex items-center gap-2">
            <Button asChild variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-8 px-2.5 text-xs">
              <Link to="/admin/alert-rules"><SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Alert Rules</Link>
            </Button>
            <Button asChild variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-8 px-2.5 text-xs">
              <Link to="/admin/kpis">KPIs</Link>
            </Button>
            <Button size="sm" onClick={load} disabled={refreshing} className="bg-[#f5c518] hover:bg-[#f5c518]/90 text-[#0f172a] font-semibold h-8 px-3 text-xs">
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </nav>
        </div>
      </header>

      {loading ? (
        <div className="py-24 flex items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading command view…
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* 1 — STATUS BAR */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 sm:px-8 py-6">
            <p className={`text-2xl sm:text-4xl font-bold tracking-tight ${statusTone}`}>{statusText}</p>
            <p className="mt-1.5 text-xs text-slate-500">
              {snap
                ? `Last updated ${new Date(snap.captured_at).toLocaleString("en-US")}, ${snap.window} rollup.`
                : "No rollup has run yet — no data yet."}
            </p>
          </section>

          {/* 2 — PROFIT LINE */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-slate-900">Cumulative profit versus plan</h2>
            <div className="h-72 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`}
                  />
                  <RTooltip
                    formatter={(v: unknown, name) => [money(v) ?? "—", String(name)]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }}
                  />
                  <Area dataKey="gap" stroke="none" fill="#2563eb" fillOpacity={0.12} name="Gap" isAnimationActive={false} />
                  <Line type="monotone" dataKey="planned" name="Plan" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="actual" name="Actual" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                  <ReferenceLine
                    y={YEAR_ONE_TARGET}
                    stroke="#f5c518"
                    strokeWidth={2}
                    label={{ value: "Year 1 target", position: "insideTopLeft", fontSize: 11, fill: "#8a6d00" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
              <Tile label="Active subs" value={count(profit.active_subs)} />
              <Tile label="MRR" value={money(profit.mrr)} />
              <Tile label="Cumulative profit" value={money(profit.cum_profit_actual)} />
              <Tile
                label="Days versus plan"
                value={
                  daysOff === null
                    ? null
                    : `${Math.abs(Math.round(daysOff))} days ${daysOff < 0 ? "behind" : "ahead"}`
                }
                tone={daysOff === null ? undefined : daysOff < 0 ? "bad" : "good"}
              />
            </div>
          </section>

          {/* 3 — CAPACITY RUNWAY */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
              <h2 className="text-base font-semibold text-slate-900">Capacity runway</h2>
              <div className="mt-4 space-y-3">
                {SERVICE_ORDER.map((key) => {
                  const s = (capacity.services ?? {})[key] as Metrics | undefined;
                  const runway = s && has(s.runway_weeks) ? Number(s.runway_weeks) : null;
                  const effective =
                    runway === null
                      ? null
                      : runway - Number(s?.lead_days ?? 0) / 7 - Number(s?.buffer_days ?? 0) / 7;
                  const hireNow = effective !== null && effective < 0;
                  const util = s && has(s.utilization_pct) ? Number(s.utilization_pct) : null;
                  return (
                    <div
                      key={key}
                      className={`rounded-lg border p-4 ${hireNow ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50"}`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className={`text-sm font-semibold ${hireNow ? "text-rose-800" : "text-slate-900"}`}>
                          {s?.service_name ?? key}
                        </p>
                        {hireNow ? (
                          <p className="text-xs font-bold uppercase tracking-wide text-rose-700">
                            HIRE NOW — needed live by {dateLabel(s?.hire_by_date ?? null) ?? "as soon as possible"}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">
                            HIRE BY{" "}
                            {dateLabel(s?.hire_by_date ?? null) ? (
                              <span className="font-semibold text-slate-800">{dateLabel(s?.hire_by_date ?? null)}</span>
                            ) : (
                              <NoData />
                            )}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-slate-500">Pros certified</p>
                          <p className="text-sm font-semibold text-slate-900"><Cell value={count(s?.pros_certified)} /></p>
                        </div>
                        <div>
                          <p className="text-slate-500">Runway</p>
                          <p className="text-sm font-semibold text-slate-900">
                            <Cell value={runway === null ? null : `${runway.toFixed(1)} weeks`} />
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Utilization</p>
                          {util === null ? (
                            <p className="text-sm"><NoData /></p>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-slate-900">{util.toFixed(0)}%</p>
                              <div className="mt-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${util >= 85 ? "bg-rose-500" : util >= 65 ? "bg-[#f5c518]" : "bg-emerald-500"}`}
                                  style={{ width: `${Math.min(100, util)}%` }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hiring pipeline funnel */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
              <h2 className="text-base font-semibold text-slate-900">Hiring pipeline</h2>
              <div className="mt-4 space-y-2">
                {PIPELINE_STAGES.map((st, i) => {
                  const row = ((capacity.pipeline ?? []) as Metrics[]).find((p) => p.stage === st.key);
                  const c = row && has(row.count) ? Number(row.count) : null;
                  const days = row && has(row.avg_days_in_stage) ? Number(row.avg_days_in_stage) : null;
                  return (
                    <div
                      key={st.key}
                      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                      style={{ marginLeft: i * 6, marginRight: i * 6 }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{st.label}</p>
                        <p className="text-sm font-bold text-slate-900">{c === null ? <NoData /> : c}</p>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {days === null ? "avg days in stage — no data yet" : `avg ${days.toFixed(1)} days in stage`}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Unassigned jobs in 72h:{" "}
                <span className="font-semibold text-slate-900"><Cell value={count(capacity.unassigned_jobs_72h)} /></span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tightest runway:{" "}
                <span className="font-semibold text-slate-900">
                  <Cell
                    value={
                      has(composites.runway_to_capacity_weeks)
                        ? `${Number(composites.runway_to_capacity_weeks).toFixed(1)} weeks`
                        : null
                    }
                  />
                </span>
              </p>
            </div>
          </section>

          {/* 4 — QR + FUNNEL BY ZIP */}
          <FunnelTable funnel={funnel} scanSeries={scanSeries} />

          {/* 5 — ALERT FEED */}
          <AlertFeed events={events} ruleByCode={ruleByCode} onUpdate={updateEvent} />

          {/* 6 — TRUST STRIP */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-slate-900">Trust</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              <Tile
                label="Named 5-star reviews (30d) · target 4"
                value={count(trust.named_5star_30d)}
                sub={
                  has(trust.named_5star_30d) && Number(trust.named_5star_30d) < 5
                    ? `${Number(trust.named_5star_30d)} of 5 needed before the hanger proof band goes live`
                    : undefined
                }
                tone={
                  has(trust.named_5star_30d)
                    ? Number(trust.named_5star_30d) >= 4 ? "good" : "bad"
                    : undefined
                }
              />
              <Tile label="Average rating (30d)" value={has(trust.avg_rating_30d) ? Number(trust.avg_rating_30d).toFixed(2) : null} />
              <Tile label="First-visit perfect" value={pct(trust.first_visit_perfect_pct_30d, 0)} />
              <Tile label="Add-on attach rate" value={pct(trust.addon_attach_rate_30d, 0)} />
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────
function Tile({
  label, value, sub, tone,
}: { label: string; value: string | null; sub?: string; tone?: "good" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${value === null ? "" : toneClass}`}>
        {value === null ? <NoData /> : value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

function Sparkline({ data }: { data: number[] | undefined }) {
  if (!data || data.length === 0 || data.every((v) => v === 0)) {
    return <span className="text-[11px] text-slate-400">— no data yet</span>;
  }
  const max = Math.max(...data, 1);
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 60},${16 - (v / max) * 14}`)
    .join(" ");
  return (
    <svg width="60" height="16" viewBox="0 0 60 16" aria-hidden className="overflow-visible">
      <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="1.5" />
    </svg>
  );
}

function cacTone(cac: number | null) {
  if (cac === null) return "";
  if (cac < 40) return "text-emerald-600 font-semibold";
  if (cac <= 55) return "text-amber-600 font-semibold";
  return "text-rose-600 font-semibold";
}

function FunnelTable({ funnel, scanSeries }: { funnel: Metrics; scanSeries: Record<string, number[]> }) {
  const zipRows = Object.keys(ZIP_LABELS).map((zip) => ({
    zip,
    label: `${zip} ${ZIP_LABELS[zip]}`,
    d: ((funnel.zips ?? {})[zip] ?? {}) as Metrics,
  }));
  // Sort by CAC ascending; ZIPs without a CAC reading sit last.
  zipRows.sort((a, b) => {
    const av = has(a.d.cac) ? Number(a.d.cac) : Number.POSITIVE_INFINITY;
    const bv = has(b.d.cac) ? Number(b.d.cac) : Number.POSITIVE_INFINITY;
    return av - bv;
  });
  const rows = [
    ...zipRows,
    { zip: "total", label: "Total", d: (funnel.total ?? {}) as Metrics },
  ];

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6 overflow-x-auto">
      <h2 className="text-base font-semibold text-slate-900">QR and funnel by ZIP</h2>
      <table className="mt-4 w-full text-xs min-w-[860px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-semibold">ZIP</th>
            <th className="py-2 pr-3 font-semibold">Hangers</th>
            <th className="py-2 pr-3 font-semibold">Scans 30d</th>
            <th className="py-2 pr-3 font-semibold">Scan rate</th>
            <th className="py-2 pr-3 font-semibold">Quote starts</th>
            <th className="py-2 pr-3 font-semibold">Paid</th>
            <th className="py-2 pr-3 font-semibold">Scan → paid</th>
            <th className="py-2 pr-3 font-semibold">CAC</th>
            <th className="py-2 pr-3 font-semibold">Coverage</th>
            <th className="py-2 pr-3 font-semibold">Last scan</th>
            <th className="py-2 pr-3 font-semibold">30d scans</th>
          </tr>
        </thead>
        <tbody className="text-slate-800">
          {rows.map((r) => {
            const cac = has(r.d.cac) ? Number(r.d.cac) : null;
            const isTotal = r.zip === "total";
            return (
              <tr key={r.zip} className={`border-t border-slate-100 ${isTotal ? "font-semibold bg-slate-50" : ""}`}>
                <td className="py-2.5 pr-3 whitespace-nowrap">{r.label}</td>
                <td className="py-2.5 pr-3"><Cell value={count(r.d.hangers_dropped_cum)} /></td>
                <td className="py-2.5 pr-3"><Cell value={count(r.d.scans_30d)} /></td>
                <td className="py-2.5 pr-3"><Cell value={pct(r.d.scan_rate, 2)} /></td>
                <td className="py-2.5 pr-3"><Cell value={count(r.d.quote_starts_30d)} /></td>
                <td className="py-2.5 pr-3"><Cell value={count(r.d.paid_30d)} /></td>
                <td className="py-2.5 pr-3"><Cell value={pct(r.d.scan_to_paid_pct, 1)} /></td>
                <td className={`py-2.5 pr-3 ${cacTone(cac)}`}><Cell value={money(cac)} /></td>
                <td className="py-2.5 pr-3">
                  <Cell value={has(r.d.coverage_passes) ? `${Number(r.d.coverage_passes).toFixed(2)}×` : null} />
                </td>
                <td className="py-2.5 pr-3">
                  <Cell value={has(r.d.days_since_last_scan) ? `${Number(r.d.days_since_last_scan)}d ago` : null} />
                </td>
                <td className="py-2.5 pr-3"><Sparkline data={scanSeries[r.zip]} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function sevDot(sev: string) {
  if (sev === "red") return "bg-rose-500";
  if (sev === "amber") return "bg-amber-500";
  return "bg-slate-400";
}

function AlertFeed({
  events, ruleByCode, onUpdate,
}: {
  events: AlertEvent[];
  ruleByCode: Record<string, AlertRule>;
  onUpdate: (id: string, status: "acknowledged" | "resolved") => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const byDomain: Record<string, AlertEvent[]> = {};
    const rank = (e: AlertEvent) => (e.status === "open" ? 0 : e.status === "acknowledged" ? 1 : 2);
    const sorted = [...events].sort(
      (a, b) => rank(a) - rank(b) || new Date(b.fired_at).getTime() - new Date(a.fired_at).getTime(),
    );
    for (const e of sorted) {
      const domain = ruleByCode[e.rule_code]?.domain ?? "other";
      (byDomain[domain] ??= []).push(e);
    }
    return byDomain;
  }, [events, ruleByCode]);

  const domains = DOMAIN_ORDER.filter((d) => grouped[d]?.length).concat(
    Object.keys(grouped).filter((d) => !DOMAIN_ORDER.includes(d)),
  );

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Alerts</h2>
      {domains.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">— no data yet. Nothing has fired.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {domains.map((domain) => {
            const all = grouped[domain] ?? [];
            const primary = all.filter((e) => !e.suppressed_in_digest);
            const hidden = all.filter((e) => e.suppressed_in_digest);
            const open = expanded[domain];
            return (
              <div key={domain}>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{domain}</p>
                <div className="mt-2 divide-y divide-slate-100">
                  {(open ? [...primary, ...hidden] : primary).map((e) => (
                    <AlertRow key={e.id} e={e} rule={ruleByCode[e.rule_code]} onUpdate={onUpdate} />
                  ))}
                </div>
                {hidden.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded((p) => ({ ...p, [domain]: !p[domain] }))}
                    className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
                  >
                    {open ? "Hide suppressed" : `${hidden.length} more in this domain`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AlertRow({
  e, rule, onUpdate,
}: {
  e: AlertEvent;
  rule: AlertRule | undefined;
  onUpdate: (id: string, status: "acknowledged" | "resolved") => void;
}) {
  const metricLine =
    has(e.metric_value) && has(e.threshold_value)
      ? `${Number(e.metric_value).toLocaleString()} vs ${Number(e.threshold_value).toLocaleString()}`
      : null;
  const resolved = e.status === "resolved";
  return (
    <div className={`py-3 flex flex-wrap items-start gap-3 ${resolved ? "opacity-55" : ""}`}>
      <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${sevDot(e.severity)}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{e.headline ?? rule?.title ?? e.rule_code}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {metricLine ?? <NoData label="no reading" />} · {relTime(e.fired_at)}
          {e.status !== "open" && <> · {e.status}</>}
        </p>
        {(rule?.action_text || e.detail) && (
          <p className="text-xs text-slate-700 mt-1">{rule?.action_text ?? e.detail}</p>
        )}
      </div>
      {!resolved && (
        <div className="flex items-center gap-2">
          {e.status === "open" && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onUpdate(e.id, "acknowledged")}>
              Acknowledge
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onUpdate(e.id, "resolved")}>
            Resolve
          </Button>
        </div>
      )}
    </div>
  );
}
