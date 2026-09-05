/**
 * Admin — Badge lifecycle (/admin/badges)
 *
 * Lists every applicant who can receive a badge. Admins can issue, suspend,
 * reinstate, or revoke badges. Every change writes to badge_status_log.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, ShieldCheck, ShieldOff, ShieldAlert, Shield, ExternalLink, History } from "lucide-react";
import { toast } from "sonner";

const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  suspended: "bg-amber-100 text-amber-800 ring-amber-200",
  revoked: "bg-red-100 text-red-800 ring-red-200",
  not_issued: "bg-slate-100 text-slate-700 ring-slate-200",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  revoked: "Revoked",
  not_issued: "Not issued",
};

type BadgeRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  pro_number: string | null;
  verify_token: string | null;
  badge_status: string | null;
  service: string | null;
  current_stage: string | null;
};

type LogRow = {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_at: string;
  note: string | null;
};

export default function AdminBadges() {
  const [rows, setRows] = useState<BadgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [params, setParams] = useSearchParams();
  const [acting, setActing] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const openId = params.get("badge");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("applicants")
      .select("id, first_name, last_name, email, pro_number, verify_token, badge_status, service, current_stage")
      .order("created_at", { ascending: false });
    setRows((data ?? []) as BadgeRow[]);
    setLoading(false);
  };

  const loadLog = async (applicantId: string) => {
    const { data } = await supabase
      .from("badge_status_log")
      .select("id, old_status, new_status, changed_at, note")
      .eq("applicant_id", applicantId)
      .order("changed_at", { ascending: false })
      .limit(50);
    setLog((data ?? []) as LogRow[]);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (openId) loadLog(openId);
    else setLog([]);
  }, [openId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.first_name, r.last_name, r.email, r.pro_number, r.service, r.current_stage]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const open = rows.find((r) => r.id === openId) ?? null;

  const doAction = async (applicantId: string, action: "issue" | "suspend" | "reinstate" | "revoke") => {
    setActing(applicantId);
    try {
      const { data, error } = await supabase.functions.invoke("badge-action", {
        body: { applicant_id: applicantId, action },
      });
      if (error) throw error;
      toast.success(`Badge ${action === "issue" ? "issued" : action === "reinstate" ? "reinstated" : action === "suspend" ? "suspended" : "revoked"}`);
      await load();
      if (openId === applicantId) await loadLog(applicantId);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Badge action failed");
    } finally {
      setActing(null);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>Badges | Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-black tracking-tight text-foreground">Badges</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Issue, suspend, reinstate, or revoke Pro badges. The public /verify page reflects changes immediately.
        </p>

        <div className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, Pro number or stage"
            className="w-full bg-transparent text-sm text-foreground outline-none"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading badges…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No applicants found.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => setParams({ badge: r.id })}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {r.first_name} {r.last_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.pro_number || "No Pro number"} · {r.service || "—"} · {r.current_stage || "—"}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${STATUS_PILL[r.badge_status || "not_issued"]}`}>
                  {STATUS_LABEL[r.badge_status || "not_issued"]}
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
              <h2 className="text-lg font-bold text-foreground">Badge record</h2>
              <button onClick={() => setParams({})} className="text-sm font-semibold text-muted-foreground">Close</button>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground">{open.first_name} {open.last_name}</p>
              <p className="text-xs text-muted-foreground">{open.email || "—"}</p>
              <p className="mt-2 text-xs font-mono text-muted-foreground">{open.pro_number || "No Pro number"}</p>
              {open.verify_token && (
                <a
                  href={`/verify/${open.verify_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Open public verify page
                </a>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {open.badge_status === "not_issued" || open.badge_status === "revoked" || open.badge_status === "suspended" ? (
                <button
                  onClick={() => doAction(open.id, "issue")}
                  disabled={acting === open.id}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {acting === open.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {open.badge_status === "not_issued" ? "Issue badge" : "Reinstate badge"}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => doAction(open.id, "suspend")}
                    disabled={acting === open.id}
                    className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {acting === open.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                    Suspend
                  </button>
                  <button
                    onClick={() => doAction(open.id, "revoke")}
                    disabled={acting === open.id}
                    className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                  >
                    {acting === open.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                    Revoke
                  </button>
                </>
              )}
            </div>

            {open.badge_status === "active" && (
              <button
                onClick={() => doAction(open.id, "reinstate")}
                disabled={acting === open.id}
                className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                {acting === open.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Reinstate badge
              </button>
            )}

            <div className="mt-6">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <History className="h-4 w-4" /> Status history
              </h3>
              {log.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No status changes yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {log.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                      <p className="font-semibold text-foreground">
                        {entry.old_status ? `${STATUS_LABEL[entry.old_status] || entry.old_status} → ` : ""}
                        {STATUS_LABEL[entry.new_status] || entry.new_status}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">{new Date(entry.changed_at).toLocaleString()}</p>
                      {entry.note && <p className="mt-0.5 italic text-muted-foreground">{entry.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
