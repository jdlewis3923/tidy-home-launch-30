/**
 * Admin — Pro Kits (/admin/pro-kits)
 *
 * Every intake row with status, service line and submitted date. Clicking a
 * row opens the editable kit record, including the admin-only compliance and
 * fulfilment fields that never appear on the public intake form.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search } from "lucide-react";
import ProKitEditor, { KIT_STATUS_LABEL, type ProKitRow } from "@/components/admin/ProKitEditor";

const STATUS_PILL: Record<string, string> = {
  sent: "bg-slate-100 text-slate-700 ring-slate-200",
  submitted: "bg-amber-100 text-amber-800 ring-amber-200",
  kit_ordered: "bg-sky-100 text-sky-800 ring-sky-200",
  kit_issued: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

export default function AdminProKits() {
  const [rows, setRows] = useState<ProKitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [params, setParams] = useSearchParams();
  const openId = params.get("kit");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pro_kit")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data ?? []) as ProKitRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.legal_name, r.badge_name, r.email, r.service_line, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>Pro Kits | Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-black tracking-tight text-foreground">Pro Kits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Intake forms sent to hired Pros, and the kit fulfilment record for each.
        </p>

        <div className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or service line"
            className="w-full bg-transparent text-sm text-foreground outline-none"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading kits…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No kits yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => setParams({ kit: r.id })}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {r.legal_name || r.badge_name || "Awaiting intake"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.service_line || "—"} ·{" "}
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "not submitted"}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${STATUS_PILL[r.status] ?? STATUS_PILL.sent}`}>
                  {KIT_STATUS_LABEL[r.status] ?? r.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setParams({})}>
          <div
            className="h-full w-full max-w-xl overflow-y-auto bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Kit record</h2>
              <button onClick={() => setParams({})} className="text-sm font-semibold text-muted-foreground">Close</button>
            </div>
            <ProKitEditor kit={open} onSaved={load} />
          </div>
        </div>
      )}
    </main>
  );
}
