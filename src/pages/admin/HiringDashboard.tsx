/**
 * Hiring dashboard — /admin/hiring (hiring v5)
 * Seat rule per service, Intent-sorted candidate table, Today list, funnel, ghost report.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle } from "lucide-react";

type Row = {
  applicant_id: string; stage: string; service: string; is_test: boolean;
  first_name: string; last_name: string; intent: number | null;
};
type GhostRow = { archive_reason: string; n: number };
type TodayRow = {
  slot_id: string; kind: string; starts_at: string; confirmed: boolean;
  applicant_id: string; name: string; service: string; phone: string;
  intent: number | null; flags: number;
};
type UnmatchedRow = { id: string; from_phone: string; body: string; created_at: string };

const STAGE_LABEL: Record<string, string> = {
  invited: "Invited", applied: "Applied", proof: "Proof", screen_booked: "Screen booked",
  phone_screened: "Phone screened", referenced: "Referenced", interviewed: "Interviewed",
  agreement: "Agreement", background: "Background", insured: "Insured", active: "Active",
};
const ORDER = ["invited", "applied", "proof", "screen_booked", "phone_screened", "referenced", "interviewed", "agreement", "background", "insured", "active"];

export default function HiringDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [ghost, setGhost] = useState<GhostRow[]>([]);
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dryRun, setDryRun] = useState<boolean | null>(null);
  const [sprint, setSprint] = useState<boolean | null>(null);
  const [today, setToday] = useState<TodayRow[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    // SMS dry-run toggle
    const { data: dr } = await supabase.from("app_settings").select("value").eq("key", "sms_dry_run").maybeSingle();
    setDryRun(dr?.value === "on");
    const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "hiring_sprint_mode").maybeSingle();
    const spv = sp?.value as { on?: boolean; until?: string } | undefined;
    setSprint(!!spv?.on && (!spv.until || new Date(spv.until) > new Date()));

    // Today list: today's booked slots (ET), time order
    const etNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const dayStart = new Date(etNow); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(etNow); dayEnd.setHours(23, 59, 59, 999);
    const { data: slots } = await supabase.from("hiring_slots")
      .select("id, kind, starts_at, confirmed_at, applicant_id")
      .eq("status", "booked")
      .gte("starts_at", dayStart.toISOString())
      .lte("starts_at", dayEnd.toISOString())
      .order("starts_at");
    const todayList: TodayRow[] = [];
    for (const s of slots ?? []) {
      const slot = s as { id: string; kind: string; starts_at: string; confirmed_at: string | null; applicant_id: string | null };
      if (!slot.applicant_id) continue;
      const { data: p } = await supabase.from("contractor_pipeline")
        .select("service, is_test, archived, applicants(first_name, last_name, phone)")
        .eq("applicant_id", slot.applicant_id).maybeSingle();
      const rec = p as unknown as { service: string; is_test: boolean; archived: boolean; applicants: { first_name: string; last_name: string; phone: string } | null } | null;
      if (!rec || rec.archived) continue;
      const { data: fr } = await supabase.rpc("hiring_fit_report", { _id: slot.applicant_id });
      const fit = fr as { intent?: number; flags?: unknown[] } | null;
      todayList.push({
        slot_id: slot.id, kind: slot.kind, starts_at: slot.starts_at, confirmed: !!slot.confirmed_at,
        applicant_id: slot.applicant_id,
        name: `${rec.applicants?.first_name ?? ""} ${rec.applicants?.last_name ?? ""}`.trim() || "—",
        service: rec.service, phone: rec.applicants?.phone ?? "",
        intent: typeof fit?.intent === "number" ? fit.intent : null,
        flags: Array.isArray(fit?.flags) ? fit.flags.length : 0,
      });
    }
    setToday(todayList);

    // Unmatched texts (unknown numbers)
    const { data: um } = await supabase.from("unmatched_texts").select("id, from_phone, body, created_at").order("created_at", { ascending: false }).limit(20);
    setUnmatched((um as UnmatchedRow[]) ?? []);
    const { data: p } = await supabase.from("contractor_pipeline")
      .select("applicant_id, stage, service, is_test, archived, applicants(first_name, last_name)")
      .eq("archived", false);
    const list: Row[] = [];
    const f: Record<string, number> = {};
    for (const r of p ?? []) {
      const rec = r as unknown as { applicant_id: string; stage: string; service: string; is_test: boolean; applicants: { first_name: string; last_name: string } | null };
      if (rec.is_test) continue;
      f[rec.stage] = (f[rec.stage] ?? 0) + 1;
      let intent: number | null = null;
      if (["interviewed", "agreement", "background", "insured"].includes(rec.stage)) {
        const { data: fr } = await supabase.rpc("hiring_fit_report", { _id: rec.applicant_id });
        intent = typeof (fr as { intent?: number })?.intent === "number" ? (fr as { intent: number }).intent : null;
      }
      list.push({
        applicant_id: rec.applicant_id, stage: rec.stage, service: rec.service, is_test: rec.is_test,
        first_name: rec.applicants?.first_name ?? "", last_name: rec.applicants?.last_name ?? "", intent,
      });
    }
    list.sort((a, b) => (b.intent ?? -1) - (a.intent ?? -1));
    setRows(list);
    setFunnel(f);
    const { data: g } = await supabase.from("contractor_pipeline").select("archive_reason").eq("archived", true).not("archive_reason", "is", null);
    const counts: Record<string, number> = {};
    for (const r of g ?? []) counts[(r as { archive_reason: string }).archive_reason] = (counts[(r as { archive_reason: string }).archive_reason] ?? 0) + 1;
    setGhost(Object.entries(counts).map(([archive_reason, n]) => ({ archive_reason, n })));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const activeByService = rows.filter((r) => ["background", "insured", "active"].includes(r.stage))
    .reduce<Record<string, number>>((m, r) => ({ ...m, [r.service]: (m[r.service] ?? 0) + 1 }), {});

  const toggleDryRun = async () => {
    const next = !dryRun;
    const { error } = await supabase.from("app_settings").update({ value: next ? "on" : "off" }).eq("key", "sms_dry_run");
    if (!error) setDryRun(next);
  };

  const toggleSprint = async () => {
    const next = !sprint;
    const { error } = await supabase.rpc("hiring_sprint_set", { _on: next });
    if (!error) setSprint(next);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Hiring</h1>
        <div className="flex items-center gap-3">
          <Link to="/admin/hiring/invite" className="text-sm text-primary underline">Invite</Link>
          <Link to="/admin/hiring/outbox" className="text-sm text-primary underline">Outbox</Link>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={!!sprint} onChange={toggleSprint} className="h-4 w-4" />
            Sprint mode (24 h deadlines)
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={!!dryRun} onChange={toggleDryRun} className="h-4 w-4" />
            SMS dry-run
          </label>
        </div>
      </div>

      {dryRun ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 mb-6 text-sm font-medium">
          SMS dry-run is ON — no texts are sent. Everything lands in the Outbox, and you can simulate replies on each candidate.
        </div>
      ) : null}
      {sprint ? (
        <div className="rounded-xl border border-blue-300 bg-blue-50 text-blue-800 px-4 py-3 mb-6 text-sm font-medium">
          Sprint mode is ON — every deadline is 24 hours with a nudge at 12. It switches off automatically Thu Oct 29 at 11:59 PM.
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-3">Today</h2>
        {today.length === 0 ? <p className="text-sm text-muted-foreground">No calls today.</p> : (
          <div className="grid gap-2">
            {today.map((t) => (
              <div key={t.slot_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3">
                <span className="text-sm font-semibold text-foreground w-20">
                  {new Date(t.starts_at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}
                </span>
                <span className={`h-2.5 w-2.5 rounded-full ${t.confirmed ? "bg-green-500" : "bg-red-500"}`} title={t.confirmed ? "Confirmed" : "Unconfirmed"} />
                <span className="text-sm text-foreground font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground capitalize">{t.service.replace("_", " ")} · {t.kind === "phone" ? "Phone" : "In person"}</span>
                <span className="text-xs text-muted-foreground">Intent {t.intent ?? "—"}{t.flags > 0 ? ` · ${t.flags} flag${t.flags === 1 ? "" : "s"}` : ""}</span>
                <span className="flex-1" />
                {t.phone ? <a href={`tel:${t.phone}`} className="text-sm text-primary underline">Call</a> : null}
                <Link to={`/admin/hiring/fit/${t.applicant_id}`} className="text-sm text-primary underline">Fit Report</Link>
                <Link to={t.kind === "phone" ? `/admin/hiring/phone/${t.applicant_id}` : `/admin/hiring/interview/${t.applicant_id}`} className="text-sm text-primary underline">Scorecard</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-2">Seats (one Pro per service until 30 reservations)</h2>
        <div className="flex gap-4">
          {["cleaning", "lawn", "car_care"].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className="text-sm text-foreground capitalize">{s.replace("_", " ")}</span>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${(activeByService[s] ?? 0) > 0 ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                {(activeByService[s] ?? 0) > 0 ? "filled" : "open"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-3">Funnel</h2>
        <div className="flex flex-wrap gap-2">
          {ORDER.map((s) => (
            <span key={s} className="text-xs px-2 py-1 rounded-full bg-muted text-foreground">{STAGE_LABEL[s]}: {funnel[s] ?? 0}</span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-3">Candidates (Intent-sorted)</h2>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No open candidates.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Service</th><th className="py-2 pr-4">Stage</th><th className="py-2 pr-4">Intent</th><th className="py-2">Fit Report</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.applicant_id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-foreground">{r.first_name} {r.last_name}</td>
                    <td className="py-2 pr-4 text-foreground capitalize">{r.service?.replace("_", " ")}</td>
                    <td className="py-2 pr-4 text-foreground">{STAGE_LABEL[r.stage] ?? r.stage}</td>
                    <td className="py-2 pr-4 font-semibold text-foreground">{r.intent ?? "—"}</td>
                    <td className="py-2"><Link className="text-primary underline" to={`/admin/hiring/fit/${r.applicant_id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Ghost report (auto-archived)</h2>
        {ghost.length === 0 ? <p className="text-sm text-muted-foreground">Nobody auto-archived yet.</p> : (
          <div className="flex flex-wrap gap-2">
            {ghost.map((g) => (
              <span key={g.archive_reason} className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800">{g.archive_reason}: {g.n}</span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground mb-3">Unmatched texts (unknown numbers)</h2>
        {unmatched.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
          <div className="grid gap-2">
            {unmatched.map((u) => (
              <div key={u.id} className="rounded-lg border border-border px-4 py-2 text-sm">
                <span className="font-medium text-foreground">{u.from_phone}</span>
                <span className="text-muted-foreground"> · {new Date(u.created_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <p className="text-foreground mt-1">{u.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
