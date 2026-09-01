/** /admin/reviews — review queue, attribution review, bonus approval, leaderboard. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useHasRoleState } from "@/hooks/useHasRole";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ReviewRow = {
  id: string; reviewer_name: string | null; stars: number; comment: string | null; posted_at: string;
  matched_pro_id: string | null; match_confidence: string; status: string; fraud_flag: string | null;
};
type Applicant = { id: string; first_name: string; last_name: string };

const HOLD_DAYS = 7;

function daysRemaining(postedAt: string): number {
  const target = new Date(postedAt).getTime() + HOLD_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
}

export default function AdminReviews() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [pros, setPros] = useState<Applicant[]>([]);
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [proFilter, setProFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [r, a, b] = await Promise.all([
      supabase.from("reviews").select("*").order("posted_at", { ascending: false }).limit(500),
      supabase.from("applicants").select("id, first_name, last_name").order("first_name"),
      supabase.from("pro_bonuses").select("*"),
    ]);
    setRows((r.data ?? []) as ReviewRow[]);
    setPros((a.data ?? []) as Applicant[]);
    setBonuses(b.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (hasRole) void fetchAll(); }, [hasRole, fetchAll]);

  if (isLoading) return null;
  if (!hasRole) return <Navigate to="/" replace />;

  const proName = (id: string | null) => {
    const p = pros.find((x) => x.id === id);
    return p ? `${p.first_name} ${p.last_name}` : "—";
  };

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (proFilter !== "all" && r.matched_pro_id !== proFilter) return false;
    if (monthFilter !== "all" && r.posted_at.slice(0, 7) !== monthFilter) return false;
    return true;
  });

  const call = async (action: string, payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("reviews-review-action", { body: { action, ...payload } });
    if (error) { toast.error(error.message); return null; }
    if (!data?.ok) { toast.error(data?.error ?? "Action failed"); return null; }
    return data;
  };

  const approve = async (id: string) => {
    const res = await call("approve", { review_id: id });
    if (res) { toast.success("Approved"); void fetchAll(); }
  };
  const reject = async (id: string) => {
    const res = await call("reject", { review_id: id });
    if (res) { toast.success("Rejected"); void fetchAll(); }
  };
  const reassign = async (id: string, proId: string) => {
    const res = await call("reassign", { review_id: id, pro_id: proId || null });
    if (res) { toast.success("Reassigned"); void fetchAll(); }
  };
  const bulkApprove = async () => {
    const ids = filtered.filter((r) => r.match_confidence === "high" && daysRemaining(r.posted_at) === 0 && r.status !== "approved" && r.status !== "paid" && r.status !== "rejected").map((r) => r.id);
    if (ids.length === 0) { toast.info("No eligible high-confidence rows past hold"); return; }
    const res = await call("bulk_approve", { review_ids: ids });
    if (res) { toast.success(`Processed ${res.outcomes.filter((o: any) => o.ok).length}/${ids.length}`); void fetchAll(); }
  };

  const monthKey = new Date().toISOString().slice(0, 7);
  const leaderboard = useMemo(() => {
    const map = new Map<string, { pro_id: string; fiveStar: number; approved: number; paid: number }>();
    for (const r of rows) {
      if (!r.matched_pro_id || r.posted_at.slice(0, 7) !== monthKey || r.stars !== 5) continue;
      const e = map.get(r.matched_pro_id) ?? { pro_id: r.matched_pro_id, fiveStar: 0, approved: 0, paid: 0 };
      e.fiveStar++;
      map.set(r.matched_pro_id, e);
    }
    for (const b of bonuses) {
      if (b.period !== monthKey) continue;
      const e = map.get(b.pro_id) ?? { pro_id: b.pro_id, fiveStar: 0, approved: 0, paid: 0 };
      if (b.status === "pending") e.approved++;
      if (b.status === "paid") e.paid++;
      map.set(b.pro_id, e);
    }
    return [...map.values()].map((e) => ({ ...e, capRemaining: Math.max(0, 4 - e.approved - e.paid) }));
  }, [rows, bonuses, monthKey]);

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-black text-foreground">Reviews & bonuses</h1>
          <div className="flex gap-2">
            <Link to="/admin/reviews/import" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Import</Link>
            <button onClick={bulkApprove} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Bulk approve (high-confidence, past hold)</button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">This month's leaderboard ({monthKey})</h2>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th>Pro</th><th>5★ named</th><th>Approved</th><th>Paid</th><th>Cap remaining</th></tr></thead>
            <tbody>
              {leaderboard.map((e) => (
                <tr key={e.pro_id} className="border-t border-border">
                  <td className="py-1">{proName(e.pro_id)}</td>
                  <td>{e.fiveStar}</td><td>{e.approved}</td><td>{e.paid}</td><td>{e.capRemaining}</td>
                </tr>
              ))}
              {leaderboard.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-muted-foreground">No matched reviews this month</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 flex-wrap text-xs">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border border-border bg-background px-2 py-1">
            {["all", "new", "matched", "awaiting_approval", "approved", "paid", "rejected", "expired"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={proFilter} onChange={(e) => setProFilter(e.target.value)} className="rounded border border-border bg-background px-2 py-1">
            <option value="all">All Pros</option>
            {pros.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
          </select>
          <input placeholder="YYYY-MM" value={monthFilter === "all" ? "" : monthFilter} onChange={(e) => setMonthFilter(e.target.value || "all")} className="rounded border border-border bg-background px-2 py-1 w-24" />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-2"><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set())} /></th>
                <th className="p-2">Reviewer</th><th className="p-2">★</th><th className="p-2">Date</th><th className="p-2">Text</th>
                <th className="p-2">Pro</th><th className="p-2">Confidence</th><th className="p-2">Status</th><th className="p-2">Hold</th><th className="p-2">Fraud</th><th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={11} className="p-4 text-center">Loading…</td></tr> :
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2"><input type="checkbox" checked={selected.has(r.id)} onChange={(e) => {
                    const next = new Set(selected); e.target.checked ? next.add(r.id) : next.delete(r.id); setSelected(next);
                  }} /></td>
                  <td className="p-2">{r.reviewer_name ?? "—"}</td>
                  <td className="p-2">{r.stars}</td>
                  <td className="p-2">{new Date(r.posted_at).toLocaleDateString()}</td>
                  <td className="p-2 max-w-xs truncate" title={r.comment ?? ""}>{(r.comment ?? "").slice(0, 60)}</td>
                  <td className="p-2">
                    <select defaultValue={r.matched_pro_id ?? ""} onChange={(e) => void reassign(r.id, e.target.value)} className="rounded border border-border bg-background px-1 py-0.5">
                      <option value="">Unassigned</option>
                      {pros.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.match_confidence === "high" ? "bg-emerald-100 text-emerald-800" : r.match_confidence === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{r.match_confidence}</span>
                  </td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{daysRemaining(r.posted_at)}d</td>
                  <td className="p-2">{r.fraud_flag ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800" title={r.fraud_flag}>⚠︎</span> : "—"}</td>
                  <td className="p-2 flex gap-1">
                    <button onClick={() => approve(r.id)} className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">Approve</button>
                    <button onClick={() => reject(r.id)} className="rounded bg-rose-600 px-2 py-1 text-[10px] font-bold text-white">Reject</button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={11} className="p-4 text-center text-muted-foreground">No reviews match filters</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
