/**
 * StatusListDrawer — Click a hero status pill to see every KPI in that bucket.
 *
 * Realtime via supabase channel on `kpi_snapshots`: rows re-sort as statuses
 * change. Searchable by KPI name/code, groupable by category. Each row has
 * an "Open Fix Panel" button that triggers the existing drill-down.
 */
import { useEffect, useMemo, useState } from "react";
import { X, Search, Wrench, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type KpiStatus = "green" | "warn" | "critical" | "unknown";

interface KpiDef {
  code: string;
  name: string;
  category: string;
  unit: string | null;
  target_label: string | null;
}
interface KpiSnap {
  kpi_code: string;
  value: number | null;
  value_text: string | null;
  status: KpiStatus;
  context: Record<string, unknown>;
  computed_at: string;
}

const STATUS_META: Record<KpiStatus, { label: string; bg: string; text: string; dot: string; ring: string }> = {
  critical: { label: "Critical", bg: "bg-rose-50", text: "text-rose-900", dot: "bg-rose-500", ring: "ring-rose-300" },
  warn:     { label: "Warning",  bg: "bg-amber-50", text: "text-amber-900", dot: "bg-amber-500", ring: "ring-amber-300" },
  green:    { label: "On target", bg: "bg-emerald-50", text: "text-emerald-900", dot: "bg-emerald-500", ring: "ring-emerald-300" },
  unknown:  { label: "Awaiting data", bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-300", ring: "ring-slate-200" },
};

function fmt(snap: KpiSnap | undefined, def: KpiDef): string {
  if (!snap) return "—";
  if (snap.value_text) return snap.value_text;
  if (snap.value == null) return "—";
  const u = def.unit ?? "";
  if (u === "$") return `$${Number(snap.value).toLocaleString()}`;
  if (u === "%") return `${Number(snap.value).toFixed(1)}%`;
  if (u === "stars") return `${Number(snap.value).toFixed(2)}★`;
  return `${Number(snap.value).toLocaleString()} ${u}`.trim();
}

function impactCents(snap: KpiSnap | undefined): number | null {
  const ctx = snap?.context as { estimated_impact_cents?: number } | undefined;
  return typeof ctx?.estimated_impact_cents === "number" ? ctx.estimated_impact_cents : null;
}

export function StatusListDrawer({
  status,
  defs,
  snapshots,
  onClose,
  onOpenFix,
  onSnapshotsChange,
}: {
  status: KpiStatus;
  defs: KpiDef[];
  snapshots: Record<string, KpiSnap>;
  onClose: () => void;
  onOpenFix: (kpi_code: string) => void;
  onSnapshotsChange: (next: Record<string, KpiSnap>) => void;
}) {
  const meta = STATUS_META[status];
  const [q, setQ] = useState("");
  const [groupByCat, setGroupByCat] = useState(true);

  // Realtime — listen for new snapshots; on change, re-derive parent state
  useEffect(() => {
    const ch = supabase
      .channel(`status-list-${status}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "kpi_snapshots" }, (payload) => {
        const row = payload.new as KpiSnap;
        const prev = snapshots[row.kpi_code];
        if (!prev || new Date(row.computed_at) > new Date(prev.computed_at)) {
          onSnapshotsChange({ ...snapshots, [row.kpi_code]: row });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [status, snapshots, onSnapshotsChange]);

  const rows = useMemo(() => {
    const matches = defs.filter((d) => {
      const s = (snapshots[d.code]?.status ?? "unknown") as KpiStatus;
      if (s !== status) return false;
      if (!q.trim()) return true;
      const needle = q.toLowerCase();
      return d.code.toLowerCase().includes(needle) || d.name.toLowerCase().includes(needle);
    });
    // Sort: critical/warn → most-impactful $ first; green → highest value; unknown → A-Z
    return matches.sort((a, b) => {
      if (status === "critical" || status === "warn") {
        const ai = impactCents(snapshots[a.code]) ?? 0;
        const bi = impactCents(snapshots[b.code]) ?? 0;
        return bi - ai;
      }
      return a.name.localeCompare(b.name);
    });
  }, [defs, snapshots, status, q]);

  const grouped = useMemo(() => {
    if (!groupByCat) return [["All", rows] as const];
    const map = new Map<string, KpiDef[]>();
    for (const d of rows) {
      const key = d.category.replace(/_/g, " ");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries());
  }, [rows, groupByCat]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="hidden sm:block flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside className="w-full sm:max-w-2xl bg-white h-full overflow-y-auto shadow-2xl sm:ml-auto flex flex-col">
        {/* Header */}
        <div className={`sticky top-0 z-10 ${meta.bg} border-b border-slate-200 px-4 sm:px-6 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${meta.dot}`} />
                <p className={`text-xs font-semibold uppercase tracking-widest ${meta.text}`}>{meta.label}</p>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">
                {rows.length} KPI{rows.length === 1 ? "" : "s"}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {status === "critical" && "Sorted by est. $ impact, most urgent first."}
                {status === "warn" && "Sorted by est. $ impact, most urgent first."}
                {status === "green" && "What's working — keep doing this."}
                {status === "unknown" && "Snapshots not yet computed."}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search KPI…"
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <button
              onClick={() => setGroupByCat((g) => !g)}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-md border ${groupByCat ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"} flex items-center gap-1`}
              type="button"
            >
              <Filter className="h-3 w-3" />
              Group
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 px-4 sm:px-6 py-4 space-y-5">
          {rows.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No KPIs in this state{q ? " match your search." : "."}
            </div>
          ) : (
            grouped.map(([cat, items]) => (
              <div key={cat}>
                {groupByCat && (
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2 capitalize">
                    {cat} <span className="text-slate-400 font-normal">· {items.length}</span>
                  </p>
                )}
                <ul className="space-y-2">
                  {items.map((d) => {
                    const s = snapshots[d.code];
                    const impact = impactCents(s);
                    return (
                      <li
                        key={d.code}
                        className={`rounded-lg border border-slate-200 bg-white px-3 py-3 ring-1 ${meta.ring}/0 hover:shadow-md transition-shadow`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 truncate">
                              {d.code}
                            </p>
                            <p className="text-sm font-semibold text-slate-900 leading-snug">{d.name}</p>
                            <div className="mt-1.5 flex items-baseline gap-3 flex-wrap">
                              <span className="text-lg font-bold text-slate-900">{fmt(s, d)}</span>
                              <span className="text-[11px] text-slate-500">
                                Target: {d.target_label ?? "—"}
                              </span>
                              {impact != null && impact > 0 && (
                                <span className="text-[11px] font-semibold text-rose-700">
                                  ~${(impact / 100).toLocaleString()} at risk
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => onOpenFix(d.code)}
                            className="h-8 px-2.5 text-xs bg-[#f5c518] hover:bg-[#e5b818] text-[#0f172a] font-semibold border-0 shrink-0"
                          >
                            <Wrench className="h-3 w-3 mr-1" />
                            Fix
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
