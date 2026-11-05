import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type Profile = { connecteam_user_id: number; name: string; email: string | null; started_on: string; coi_verified_at: string | null; tier2_since: string | null; is_test: boolean; paperwork_status?:Record<string,string>; paperwork_complete?:boolean; pay_setup_unblocked?:boolean; coi_expires_at?:string|null };
type Line = { id: string; connecteam_user_id: number; week_start: string; payout_friday: string; kind: string; description: string; pay_cents: number; status: string; is_test: boolean; member_user_id: string | null };
type Review = { id: string; reviewer_name: string | null; rating: number | null; review_text: string | null; match_status: string | null; matched_ct_user_id: number | null; match_note: string | null; bonus_paid_at: string | null };
type Visit = { connecteam_user_id: number | null; team_user_ids: number[] | null; rating: number | null; status: string };

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function AdminProPay() {
  const [showTest, setShowTest] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [week, setWeek] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, l, r, v] = await Promise.all([
      supabase.from("pro_pay_profiles").select("*").eq("is_test", showTest).order("name"),
      supabase.from("pro_pay_lines").select("*").eq("is_test", showTest).order("week_start", { ascending: false }).limit(2000),
      supabase.from("google_reviews").select("id, reviewer_name, rating, review_text, match_status, matched_ct_user_id, match_note, bonus_paid_at").not("match_status", "is", null),
      supabase.from("jobber_visits").select("connecteam_user_id, team_user_ids, rating, status").eq("status", "complete").eq("is_test", showTest),
    ]);
    setProfiles((p.data ?? []) as Profile[]);
    const ls = (l.data ?? []) as Line[];
    setLines(ls);
    setReviews((r.data ?? []) as Review[]);
    setVisits((v.data ?? []) as Visit[]);
    if (ls.length && !ls.some((x) => x.week_start === week)) setWeek(ls[0].week_start);
  }, [showTest, week]);
  useEffect(() => { void load(); }, [showTest]); // eslint-disable-line react-hooks/exhaustive-deps

  const weeks = useMemo(() => [...new Set(lines.map((l) => l.week_start))], [lines]);
  const weekLines = lines.filter((l) => l.week_start === week);
  const nameOf = (id: number) => profiles.find((p) => p.connecteam_user_id === id)?.name ?? String(id);

  const invoke = async (body: Record<string, unknown>, label: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("pro-pay", { body });
    setBusy(false);
    toast({ title: error || data?.ok === false ? `${label} failed` : label, description: error?.message ?? data?.error });
    await load();
  };

  const exportCsv = () => {
    const byPro = new Map<number, number>();
    weekLines.forEach((l) => byPro.set(l.connecteam_user_id, (byPro.get(l.connecteam_user_id) ?? 0) + l.pay_cents));
    const rows = [["Contractor", "Email", "Payment date", "Amount", "Memo"]];
    for (const [id, cents] of byPro) {
      const p = profiles.find((x) => x.connecteam_user_id === id);
      rows.push([p?.name ?? String(id), p?.email ?? "", weekLines[0]?.payout_friday ?? "", (cents / 100).toFixed(2), `Tidy pay week of ${week}`]);
    }
    rows.push([], ["Contractor", "Kind", "Description", "Amount"]);
    weekLines.forEach((l) => rows.push([nameOf(l.connecteam_user_id), l.kind, l.description, (l.pay_cents / 100).toFixed(2)]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `tidy-pro-pay-${week}.csv`;
    a.click();
  };

  return (
    <main className="admin-page">
      <Helmet><title>Pro Pay · Tidy Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <header className="admin-page-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
          <div><h1 className="text-lg sm:text-xl font-bold">Pro Pay</h1><p className="text-xs text-muted-foreground">From completed Connecteam Visit Reports. Nothing is paid automatically.</p></div>
          <div className="ml-auto flex flex-wrap gap-2">
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} /> Test data</label>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => invoke({ action: "build_week", week_start: week || undefined }, "Week rebuilt")}>Rebuild week</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => invoke({ action: "match_reviews" }, "Reviews matched")}>Match reviews</Button>
            <Button size="sm" disabled={!weekLines.length} onClick={exportCsv} className="bg-gold hover:bg-gold/90 text-gold-foreground font-semibold">Export CSV (QuickBooks)</Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <section id="insurance" className="scroll-mt-16 border-b border-border pb-5">
          <h2 className="text-base font-semibold">Connecteam paperwork</h2>
          {profiles.map(p=><div key={p.connecteam_user_id} className="py-3 border-b border-border text-sm">
            <p className="font-semibold">{p.name} · {p.paperwork_complete?'Complete':'Waiting'}</p>
            <p className="text-muted-foreground">W-9: {p.paperwork_status?.w9??'Not checked'} · COI: {p.paperwork_status?.coi??'Not checked'} · Agreement: {p.paperwork_status?.agreement??'Not checked'}</p>
            <p>{p.pay_setup_unblocked?'Pay setup unblocked':'Pay setup waiting for paperwork'}{p.coi_expires_at?` · COI expires ${p.coi_expires_at.slice(0,10)}`:''}</p>
          </div>)}
        </section>
        <section className="bg-card rounded-xl border border-border p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold">Week</h2>
            <select className="rounded border border-input bg-background px-2 py-1 text-sm" value={week} onChange={(e) => setWeek(e.target.value)}>
              {weeks.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
            {weekLines[0] && <span className="text-sm text-muted-foreground">Paid Friday {weekLines[0].payout_friday} · Total {money(weekLines.reduce((s, l) => s + l.pay_cents, 0))}</span>}
          </div>
          {profiles.map((p) => {
            const mine = weekLines.filter((l) => l.connecteam_user_id === p.connecteam_user_id);
            if (!mine.length) return null;
            return (
              <div key={p.connecteam_user_id} className="mt-4">
                <p className="font-semibold">{p.name} — {money(mine.reduce((s, l) => s + l.pay_cents, 0))}</p>
                <table className="mt-1 w-full text-sm"><tbody>
                  {mine.map((l) => <tr key={l.id} className="border-b border-border"><td className="py-1 pr-2 text-muted-foreground">{l.kind}</td><td className="py-1 pr-2">{l.description}</td><td className="py-1 text-right">{money(l.pay_cents)}</td></tr>)}
                </tbody></table>
              </div>
            );
          })}
          {!weekLines.length && <p className="mt-3 text-sm text-muted-foreground">No pay lines yet.</p>}
        </section>

        <section className="bg-card rounded-xl border border-border p-5 overflow-x-auto">
          <h2 className="text-base font-semibold">Per Pro</h2>
          <table className="mt-3 w-full text-sm min-w-[760px]">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground"><th>Pro</th><th>Year to date</th><th>Reviews</th><th>5-star</th><th>Paid</th><th>Pending</th><th>Tier 2 progress</th></tr></thead>
            <tbody>
              {profiles.map((p) => {
                const id = p.connecteam_user_id;
                const mineV = visits.filter((v) => v.connecteam_user_id === id || v.team_user_ids?.includes(id));
                const rated = mineV.filter((v) => v.rating != null);
                const avg = rated.length ? rated.reduce((s, v) => s + (v.rating ?? 0), 0) / rated.length : null;
                const days = Math.floor((Date.now() - new Date(p.started_on).getTime()) / 86400000);
                const revs = reviews.filter((r) => r.matched_ct_user_id === id);
                const ytd = lines.filter((l) => l.connecteam_user_id === id && l.week_start.startsWith(String(new Date().getFullYear()))).reduce((s, l) => s + l.pay_cents, 0);
                return (
                  <tr key={id} className="border-b border-border">
                    <td className="py-2">{p.name}</td><td>{money(ytd)}</td><td>{revs.length}</td><td>{revs.filter((r) => r.rating === 5).length}</td>
                    <td>{lines.filter((l) => l.connecteam_user_id === id && l.kind === "review_bonus").length}</td><td>{revs.filter((r) => r.match_status === "pending").length}</td>
                    <td>{p.tier2_since ? `Tier 2 since ${p.tier2_since.slice(0, 10)}` : `${mineV.length}/50 visits · ${avg ? avg.toFixed(2) : "—"}/4.8 · ${days}/60 days`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section id="reviews" className="scroll-mt-16 bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold">Review matches needing your approval</h2>
          {reviews.filter((r) => r.match_status === "pending").map((r) => (
            <div key={r.id} className="mt-3 rounded-lg border border-border p-3 text-sm">
              <p><b>{r.reviewer_name}</b> · {r.rating}★ · {r.matched_ct_user_id ? nameOf(r.matched_ct_user_id) : "?"} · <span className="text-muted-foreground">{r.match_note}</span></p>
              <p className="mt-1 text-muted-foreground">{r.review_text}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => invoke({ action: "decide_review", id: r.id, approve: true }, "Approved — $25 goes on this Friday")}>Approve $25</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => invoke({ action: "decide_review", id: r.id, approve: false }, "Rejected")}>Reject</Button>
              </div>
            </div>
          ))}
          {!reviews.some((r) => r.match_status === "pending") && <p className="mt-2 text-sm text-muted-foreground">Nothing waiting.</p>}
        </section>
      </div>
    </main>
  );
}
