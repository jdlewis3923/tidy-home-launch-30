/**
 * /admin/kpis — Permanent KPI Command Center
 *
 * Renders 38 KPIs across 7 categories with hero strip, collapsible sections,
 * and a drill-down panel showing playbook steps with "Fix This" buttons that
 * dispatch AUTO actions to the kpi-recovery-action edge function.
 *
 * Data sources (all admin-RLS):
 *  - kpi_definitions (seed of 38 KPIs + playbooks)
 *  - kpi_snapshots (latest computed value/status per KPI)
 *  - kpi_alerts (open warn/critical alerts)
 *
 * UI shell only this turn — snapshot rows will be empty until the
 * compute-kpi edge function runs (next turn). Cards render with
 * status='unknown' / "—" placeholders until then.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Wrench,
  Info,
  Hand,
  Zap,
  X,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type KpiCategory =
  | "acquisition"
  | "conversion"
  | "operations"
  | "customer_health"
  | "reviews"
  | "financial"
  | "system_health";

type KpiStatus = "green" | "warn" | "critical" | "unknown";
type ActionType = "AUTO" | "MANUAL" | "INFO";

interface PlaybookStep {
  step: string;
  action_type: ActionType;
  action_key?: string;
}

interface KpiDefinition {
  id: string;
  code: string;
  name: string;
  category: KpiCategory;
  frequency: string;
  unit: string | null;
  target_value: number | null;
  target_label: string | null;
  warn_label: string | null;
  critical_label: string | null;
  direction: string;
  source: string | null;
  display_order: number;
  playbook: PlaybookStep[];
}

interface KpiSnapshot {
  kpi_code: string;
  value: number | null;
  value_text: string | null;
  status: KpiStatus;
  context: Record<string, unknown>;
  computed_at: string;
}

interface KpiAlert {
  id: string;
  kpi_code: string;
  severity: "warn" | "critical";
  message: string;
  created_at: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Section metadata (brand: royal blue / gold / navy)
// ────────────────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  KpiCategory,
  { label: string; emoji: string; description: string }
> = {
  acquisition: {
    label: "Acquisition",
    emoji: "📣",
    description: "Traffic, ads, social — top of funnel.",
  },
  conversion: {
    label: "Conversion",
    emoji: "🎯",
    description: "Visitors → signups → paying subs.",
  },
  operations: {
    label: "Operations",
    emoji: "🛠️",
    description: "Visits, crews, scheduling, on-time.",
  },
  customer_health: {
    label: "Customer Health",
    emoji: "❤️",
    description: "Active subs, churn, NPS, support load.",
  },
  reviews: {
    label: "Reviews & Reputation",
    emoji: "⭐",
    description: "Google, Nextdoor, star delta.",
  },
  financial: {
    label: "Financial",
    emoji: "💰",
    description: "MRR, payments, margins, promo cost.",
  },
  system_health: {
    label: "System Health",
    emoji: "🩺",
    description: "Edge errors, webhooks, deliverability.",
  },
};

const CATEGORY_ORDER: KpiCategory[] = [
  "acquisition",
  "conversion",
  "operations",
  "customer_health",
  "reviews",
  "financial",
  "system_health",
];

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function statusTone(status: KpiStatus) {
  switch (status) {
    case "green":
      return {
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        text: "text-emerald-700",
        dot: "bg-emerald-500",
        label: "On target",
      };
    case "warn":
      return {
        bg: "bg-amber-50",
        border: "border-amber-300",
        text: "text-amber-800",
        dot: "bg-amber-500",
        label: "Warning",
      };
    case "critical":
      return {
        bg: "bg-rose-50",
        border: "border-rose-300",
        text: "text-rose-800",
        dot: "bg-rose-500",
        label: "Critical",
      };
    default:
      return {
        bg: "bg-slate-50",
        border: "border-slate-200",
        text: "text-slate-500",
        dot: "bg-slate-300",
        label: "Awaiting data",
      };
  }
}

function formatValue(snap: KpiSnapshot | undefined, def: KpiDefinition): string {
  if (!snap) return "—";
  if (snap.value_text) return snap.value_text;
  if (snap.value === null || snap.value === undefined) return "—";
  const unit = def.unit ?? "";
  if (unit === "$") return `$${Number(snap.value).toLocaleString()}`;
  if (unit === "%") return `${Number(snap.value).toFixed(1)}%`;
  if (unit === "stars") return `${Number(snap.value).toFixed(2)}★`;
  return `${Number(snap.value).toLocaleString()} ${unit}`.trim();
}

function actionTypeIcon(type: ActionType) {
  if (type === "AUTO") return <Zap className="h-3.5 w-3.5" />;
  if (type === "MANUAL") return <Hand className="h-3.5 w-3.5" />;
  return <Info className="h-3.5 w-3.5" />;
}

function actionTypeColor(type: ActionType) {
  if (type === "AUTO") return "bg-[#f5c518]/15 text-[#7a5a00] border-[#f5c518]/40";
  if (type === "MANUAL") return "bg-slate-100 text-slate-700 border-slate-300";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function AdminKpis() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  // null = checking, false = not signed in, true = signed in
  const [authed, setAuthed] = useState<null | boolean>(null);
  const [defs, setDefs] = useState<KpiDefinition[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, KpiSnapshot>>({});
  const [alerts, setAlerts] = useState<KpiAlert[]>([]);
  const [openSections, setOpenSections] = useState<Record<KpiCategory, boolean>>(
    () =>
      CATEGORY_ORDER.reduce((acc, c) => {
        acc[c] = true;
        return acc;
      }, {} as Record<KpiCategory, boolean>),
  );
  const [drillCode, setDrillCode] = useState<string | null>(null);

  // ─────── Auth + admin-role gate ───────
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
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      if (!active) return;
      if (!isAdmin) {
        setForbidden(true);
        setAuthed(true);
        setLoading(false);
      } else {
        setAuthed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);


  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [defsRes, snapsRes, alertsRes] = await Promise.all([
        supabase
          .from("kpi_definitions")
          .select("*")
          .eq("enabled", true)
          .order("display_order", { ascending: true }),
        // Get latest snapshot per kpi_code via a window-style query (RLS = admin)
        supabase
          .from("kpi_snapshots")
          .select("*")
          .order("computed_at", { ascending: false })
          .limit(500),
        supabase
          .from("kpi_alerts")
          .select("id, kpi_code, severity, message, created_at")
          .is("resolved_at", null)
          .order("created_at", { ascending: false }),
      ]);

      if (defsRes.error) {
        // RLS blocks non-admins → treat as forbidden
        if (
          defsRes.error.code === "42501" ||
          defsRes.error.message?.toLowerCase().includes("permission")
        ) {
          setForbidden(true);
          return;
        }
        throw defsRes.error;
      }

      setDefs((defsRes.data ?? []) as unknown as KpiDefinition[]);

      // Reduce snapshots → latest per kpi_code
      const latest: Record<string, KpiSnapshot> = {};
      for (const s of (snapsRes.data ?? []) as unknown as KpiSnapshot[]) {
        if (!latest[s.kpi_code]) latest[s.kpi_code] = s;
      }
      setSnapshots(latest);

      setAlerts((alertsRes.data ?? []) as unknown as KpiAlert[]);
    } catch (err) {
      console.error("[AdminKpis] load failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authed === true && !forbidden) load();
  }, [load, authed, forbidden]);

  const grouped = useMemo(() => {
    const out: Record<KpiCategory, KpiDefinition[]> = {
      acquisition: [],
      conversion: [],
      operations: [],
      customer_health: [],
      reviews: [],
      financial: [],
      system_health: [],
    };
    for (const d of defs) out[d.category]?.push(d);
    return out;
  }, [defs]);

  const heroCounts = useMemo(() => {
    let green = 0,
      warn = 0,
      critical = 0,
      unknown = 0;
    for (const d of defs) {
      const s = snapshots[d.code]?.status ?? "unknown";
      if (s === "green") green++;
      else if (s === "warn") warn++;
      else if (s === "critical") critical++;
      else unknown++;
    }
    return { green, warn, critical, unknown, total: defs.length };
  }, [defs, snapshots]);

  const drillDef = drillCode ? defs.find((d) => d.code === drillCode) : null;
  const drillSnap = drillCode ? snapshots[drillCode] : undefined;

  // ──────────── render ────────────

  // Still checking session
  if (authed === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Not signed in → bounce to login, preserving destination
  if (authed === false) {
    return <Navigate to="/login?redirect=/admin/kpis" replace />;
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Admins only</h1>
          <p className="text-slate-600">
            The KPI Command Center is restricted to admin accounts. Sign in with an admin account.
          </p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>KPI Command Center · Tidy</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      {/* Header — navy with gold accent */}
      <header className="bg-[#0f172a] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-[#f5c518] font-semibold">
              Tidy · Operating System
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold mt-1">
              KPI Command Center
            </h1>
            <p className="text-slate-300 text-sm mt-1">
              {heroCounts.total} KPIs across 7 sections · Day-90 launch window
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border border-white/20">
              <Link to="/">Home</Link>
            </Button>
            <Button asChild variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border border-white/20">
              <Link to="/dashboard">Customer dashboard</Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={load}
              disabled={refreshing}
              className="bg-[#f5c518] hover:bg-[#f5c518]/90 text-[#0f172a] border-0 font-semibold"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Hero status strip */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HeroStat
            label="On target"
            count={heroCounts.green}
            tone="green"
          />
          <HeroStat label="Warning" count={heroCounts.warn} tone="warn" />
          <HeroStat label="Critical" count={heroCounts.critical} tone="critical" />
          <HeroStat
            label="Awaiting data"
            count={heroCounts.unknown}
            tone="unknown"
          />
        </div>
      </div>

      {/* Open alerts banner */}
      {alerts.length > 0 && (
        <div className="bg-rose-50 border-b border-rose-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-900">
                {alerts.length} open alert{alerts.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-rose-700 mt-0.5">
                {alerts
                  .slice(0, 3)
                  .map((a) => a.kpi_code)
                  .join(" · ")}
                {alerts.length > 3 ? ` +${alerts.length - 3} more` : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {loading ? (
          <div className="py-20 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading KPIs…
          </div>
        ) : (
          CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat] ?? [];
            if (items.length === 0) return null;
            const open = openSections[cat];
            const sectionCounts = items.reduce(
              (acc, d) => {
                const s = snapshots[d.code]?.status ?? "unknown";
                acc[s] = (acc[s] ?? 0) + 1;
                return acc;
              },
              {} as Record<KpiStatus, number>,
            );
            return (
              <section
                key={cat}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenSections((prev) => ({ ...prev, [cat]: !prev[cat] }))
                  }
                  className="w-full flex items-center justify-between px-4 sm:px-6 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 text-left">
                    <span className="text-2xl" aria-hidden>
                      {CATEGORY_META[cat].emoji}
                    </span>
                    <div>
                      <h2 className="text-base sm:text-lg font-semibold text-slate-900">
                        {CATEGORY_META[cat].label}
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          {items.length} KPI{items.length > 1 ? "s" : ""}
                        </span>
                      </h2>
                      <p className="text-xs text-slate-500">
                        {CATEGORY_META[cat].description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SectionDots counts={sectionCounts} />
                    {open ? (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                </button>
                {open && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 sm:p-6 pt-0">
                    {items.map((d) => (
                      <KpiCard
                        key={d.code}
                        def={d}
                        snap={snapshots[d.code]}
                        onClick={() => setDrillCode(d.code)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </main>

      {/* Drill-down sheet */}
      {drillDef && (
        <DrillDown
          def={drillDef}
          snap={drillSnap}
          alerts={alerts.filter((a) => a.kpi_code === drillDef.code)}
          onClose={() => setDrillCode(null)}
          onActionRan={load}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function HeroStat({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: KpiStatus;
}) {
  const t = statusTone(tone);
  return (
    <div className={`rounded-lg border ${t.border} ${t.bg} px-4 py-3`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${t.text}`}>
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{count}</div>
    </div>
  );
}

function SectionDots({ counts }: { counts: Record<KpiStatus, number> }) {
  return (
    <div className="hidden sm:flex items-center gap-2 text-xs">
      {(["critical", "warn", "green", "unknown"] as KpiStatus[]).map((s) =>
        (counts[s] ?? 0) > 0 ? (
          <span key={s} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${statusTone(s).dot}`} />
            <span className="text-slate-600">{counts[s]}</span>
          </span>
        ) : null,
      )}
    </div>
  );
}

function KpiCard({
  def,
  snap,
  onClick,
}: {
  def: KpiDefinition;
  snap: KpiSnapshot | undefined;
  onClick: () => void;
}) {
  const status = (snap?.status ?? "unknown") as KpiStatus;
  const t = statusTone(status);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border ${t.border} ${t.bg} hover:shadow-md transition-shadow p-4 group`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 truncate">
            {def.code}
          </p>
          <p className="text-sm font-semibold text-slate-900 mt-0.5 leading-snug">
            {def.name}
          </p>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full mt-1.5 ${t.dot} shrink-0`} />
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-2xl font-bold text-slate-900">
          {formatValue(snap, def)}
        </span>
        <span className={`text-xs font-medium ${t.text}`}>{t.label}</span>
      </div>
      <p className="text-xs text-slate-500 mt-2 truncate">
        Target: {def.target_label ?? "—"} · {def.frequency}
      </p>
    </button>
  );
}

function DrillDown({
  def,
  snap,
  alerts,
  onClose,
  onActionRan,
}: {
  def: KpiDefinition;
  snap: KpiSnapshot | undefined;
  alerts: KpiAlert[];
  onClose: () => void;
  onActionRan: () => void;
}) {
  const t = statusTone((snap?.status ?? "unknown") as KpiStatus);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>(
    {},
  );

  const runAuto = async (step: PlaybookStep, idx: number) => {
    if (!step.action_key) return;
    const key = `${idx}:${step.action_key}`;
    setRunning(key);
    try {
      const { data, error } = await supabase.functions.invoke(
        "kpi-recovery-action",
        {
          body: {
            kpi_code: def.code,
            action_key: step.action_key,
            action_label: step.step,
          },
        },
      );
      if (error) throw error;
      setResults((prev) => ({
        ...prev,
        [key]: {
          ok: true,
          msg: (data as { message?: string })?.message ?? "Action queued.",
        },
      }));
      onActionRan();
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [key]: {
          ok: false,
          msg:
            err instanceof Error
              ? err.message
              : "Handler not yet implemented (deploys next turn).",
        },
      }));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {CATEGORY_META[def.category].label} · {def.code}
            </p>
            <h2 className="text-xl font-semibold text-slate-900 mt-0.5">{def.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Current value */}
          <div className={`rounded-lg border ${t.border} ${t.bg} px-4 py-4`}>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-3xl font-bold text-slate-900">
                  {formatValue(snap, def)}
                </p>
                <p className={`text-sm font-medium mt-0.5 ${t.text}`}>{t.label}</p>
              </div>
              <div className="text-right text-xs text-slate-600 space-y-0.5">
                <div>Target: {def.target_label ?? "—"}</div>
                {def.warn_label && <div>Warn: {def.warn_label}</div>}
                {def.critical_label && <div>Critical: {def.critical_label}</div>}
              </div>
            </div>
            {snap && (
              <p className="text-xs text-slate-500 mt-3">
                Last computed: {new Date(snap.computed_at).toLocaleString()}
              </p>
            )}
          </div>

          {/* Open alerts */}
          {alerts.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span className="text-sm font-semibold text-rose-900">
                  {alerts.length} open alert{alerts.length > 1 ? "s" : ""}
                </span>
              </div>
              <ul className="text-xs text-rose-800 space-y-1">
                {alerts.map((a) => (
                  <li key={a.id}>
                    <span className="font-semibold uppercase">{a.severity}</span> ·{" "}
                    {a.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Playbook */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-[#2563eb]" />
              Recovery Playbook
            </h3>
            <ol className="space-y-2">
              {def.playbook.map((step, idx) => {
                const key = `${idx}:${step.action_key ?? ""}`;
                const r = results[key];
                return (
                  <li
                    key={idx}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 h-6 w-6 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900">{step.step}</p>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${actionTypeColor(step.action_type)}`}
                          >
                            {actionTypeIcon(step.action_type)}
                            {step.action_type}
                          </span>
                          {step.action_type === "AUTO" && (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={running === key}
                              onClick={() => runAuto(step, idx)}
                              className="h-7 px-2.5 text-xs bg-[#f5c518] hover:bg-[#e5b818] text-[#0f172a] font-semibold border-0"
                            >
                              {running === key ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Zap className="h-3 w-3 mr-1" />
                              )}
                              Fix This
                            </Button>
                          )}
                        </div>
                        {r && (
                          <div
                            className={`mt-2 text-xs flex items-start gap-1.5 ${
                              r.ok ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {r.ok ? (
                              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            )}
                            <span>{r.msg}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="text-xs text-slate-500 pt-2 border-t border-slate-200">
            Source: <span className="font-mono">{def.source ?? "—"}</span> ·
            Frequency: <span className="font-mono">{def.frequency}</span> ·
            Direction: <span className="font-mono">{def.direction}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
