/**
 * Admin → Insurance Compliance.
 *
 * Filterable roster of contractor insurance records, a review drawer with signed
 * (short-lived) COI links + approve / request update / reject / waive, funnel
 * reporting, and the centralized requirement configuration per service category.
 * Everything here is admin-only (RLS + the insurance-decision function both
 * enforce the admin role server-side).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText, Loader2, ShieldCheck, RefreshCw } from "lucide-react";
import {
  STATUS_LABEL, maskPolicy, usd, type InsuranceStatus,
} from "@/lib/insurance";

type Row = {
  id: string;
  applicant_id: string | null;
  contractor_id: string | null;
  provider: string;
  service_category: string | null;
  coverage_type: string | null;
  carrier_name: string | null;
  policy_number: string | null;
  per_occurrence_limit_cents: number | null;
  aggregate_limit_cents: number | null;
  effective_date: string | null;
  expiration_date: string | null;
  certificate_path: string | null;
  additional_insured_status: string;
  verification_status: InsuranceStatus;
  verified_at: string | null;
  created_at: string;
  rejection_reason: string | null;
};

type Applicant = { id: string; first_name: string; last_name: string; email: string; service: string | null };

type Requirement = {
  id: string;
  service_category: string;
  per_occurrence_limit_cents: number;
  aggregate_limit_cents: number;
  additional_insured_required: boolean;
  reminder_days: number[];
  manual_verification_required: boolean;
};

type AuditRow = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  created_at: string;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "verified", label: "Verified" },
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
  { key: "exp30", label: "Expiring ≤ 30d" },
  { key: "exp14", label: "Expiring ≤ 14d" },
  { key: "exp7", label: "Expiring ≤ 7d" },
  { key: "expired", label: "Expired" },
  { key: "missing", label: "Missing coverage" },
  { key: "waived", label: "Waived" },
] as const;

const PILL: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  waived: "bg-sky-100 text-sky-700 ring-sky-200",
  pending_verification: "bg-amber-100 text-amber-700 ring-amber-200",
  update_requested: "bg-amber-100 text-amber-700 ring-amber-200",
  expiring_soon: "bg-amber-100 text-amber-700 ring-amber-200",
  rejected: "bg-rose-100 text-rose-700 ring-rose-200",
  expired: "bg-rose-100 text-rose-700 ring-rose-200",
  coverage_needed: "bg-slate-100 text-slate-600 ring-slate-200",
  not_started: "bg-slate-100 text-slate-500 ring-slate-200",
};

const daysUntil = (d?: string | null) =>
  d ? Math.ceil((new Date(`${d}T00:00:00Z`).getTime() - Date.now()) / 86400000) : null;

export default function AdminInsurance() {
  const [rows, setRows] = useState<Row[]>([]);
  const [applicants, setApplicants] = useState<Record<string, Applicant>>({});
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [insRes, reqRes] = await Promise.all([
      supabase.from("contractor_insurance").select("*").order("created_at", { ascending: false }),
      supabase.from("insurance_requirements").select("*").order("service_category"),
    ]);
    const list = (insRes.data ?? []) as Row[];
    setRows(list);
    setRequirements((reqRes.data ?? []) as Requirement[]);

    const ids = [...new Set(list.map((r) => r.applicant_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: apps } = await supabase
        .from("applicants")
        .select("id, first_name, last_name, email, service")
        .in("id", ids);
      const map: Record<string, Applicant> = {};
      for (const a of apps ?? []) map[a.id] = a as Applicant;
      setApplicants(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!openId) { setAudit([]); return; }
    void (async () => {
      const { data } = await supabase
        .from("insurance_audit_log")
        .select("id, action, from_status, to_status, reason, created_at")
        .eq("insurance_id", openId)
        .order("created_at", { ascending: false });
      setAudit((data ?? []) as AuditRow[]);
    })();
  }, [openId]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const d = daysUntil(r.expiration_date);
      switch (filter) {
        case "verified": return r.verification_status === "verified";
        case "pending": return r.verification_status === "pending_verification" || r.verification_status === "update_requested";
        case "rejected": return r.verification_status === "rejected";
        case "expired": return r.verification_status === "expired" || (d !== null && d <= 0);
        case "exp30": return d !== null && d > 0 && d <= 30;
        case "exp14": return d !== null && d > 0 && d <= 14;
        case "exp7": return d !== null && d > 0 && d <= 7;
        case "missing": return r.verification_status === "not_started" || r.verification_status === "coverage_needed";
        case "waived": return r.verification_status === "waived";
        default: return true;
      }
    });
  }, [rows, filter]);

  const stats = useMemo(() => {
    const total = rows.length || 1;
    const insured = rows.filter((r) => r.provider !== "thimble").length;
    const needs = rows.filter((r) => r.verification_status === "coverage_needed").length;
    const verified = rows.filter((r) => r.verification_status === "verified").length;
    const submitted = rows.filter((r) => r.verification_status !== "coverage_needed" && r.verification_status !== "not_started").length;
    const verifyDurations = rows
      .filter((r) => r.verified_at)
      .map((r) => (new Date(r.verified_at as string).getTime() - new Date(r.created_at).getTime()) / 3600000);
    const avgHours = verifyDurations.length
      ? verifyDurations.reduce((a, b) => a + b, 0) / verifyDurations.length
      : null;
    return {
      alreadyInsuredPct: Math.round((insured / total) * 100),
      needsInsurancePct: Math.round((needs / total) * 100),
      verificationRate: submitted ? Math.round((verified / submitted) * 100) : 0,
      abandonmentPct: Math.round(((rows.length - submitted) / total) * 100),
      avgHours,
      preferredConversionPct: Math.round((rows.filter((r) => r.provider === "thimble" && r.certificate_path).length / total) * 100),
    };
  }, [rows]);

  const openCoi = async (path: string | null) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from("contractor-coi-pdfs").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error("Could not open certificate"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const decide = async (row: Row, decision: "approve" | "request_update" | "reject" | "waive") => {
    if (decision !== "approve" && reason.trim().length < 3) {
      toast.error("An internal reason is required");
      return;
    }
    setBusy(decision);
    try {
      const { error } = await supabase.functions.invoke("insurance-decision", {
        body: { insurance_id: row.id, decision, reason: reason.trim() || undefined },
      });
      if (error) throw error;
      toast.success(
        decision === "approve" ? "Coverage approved"
        : decision === "reject" ? "Coverage rejected"
        : decision === "waive" ? "Requirement waived (audited)"
        : "Update requested",
      );
      setReason("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const saveRequirement = async (r: Requirement) => {
    const { error } = await supabase
      .from("insurance_requirements")
      .update({
        per_occurrence_limit_cents: r.per_occurrence_limit_cents,
        aggregate_limit_cents: r.aggregate_limit_cents,
        additional_insured_required: r.additional_insured_required,
        reminder_days: r.reminder_days,
        manual_verification_required: r.manual_verification_required,
      })
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("insurance_audit_log").insert({
      action: "requirements_changed",
      metadata: { service_category: r.service_category, per_occurrence_limit_cents: r.per_occurrence_limit_cents },
    });
    toast.success(`${r.service_category} requirements saved`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 grid place-items-center">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0D1117]">Insurance Compliance</h1>
              <p className="text-sm text-slate-500">Contractor coverage, verification and expiration.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Already insured" value={`${stats.alreadyInsuredPct}%`} />
          <Stat label="Need coverage" value={`${stats.needsInsurancePct}%`} />
          <Stat label="Verification rate" value={`${stats.verificationRate}%`} />
          <Stat label="Step abandonment" value={`${stats.abandonmentPct}%`} />
          <Stat label="Avg time to verify" value={stats.avgHours === null ? "—" : `${stats.avgHours.toFixed(1)} h`} />
          <Stat label="Preferred provider conv." value={`${stats.preferredConversionPct}%`} />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                filter === f.key ? "bg-[#0D1117] text-white ring-[#0D1117]" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Card className="rounded-2xl border-slate-200">
          <CardContent className="p-0 divide-y divide-slate-100">
            {loading ? (
              <p className="p-6 text-sm text-slate-400 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No insurance records match this filter.</p>
            ) : (
              filtered.map((r) => {
                const a = r.applicant_id ? applicants[r.applicant_id] : undefined;
                const d = daysUntil(r.expiration_date);
                const open = openId === r.id;
                return (
                  <div key={r.id} className="p-4">
                    <button className="w-full text-left" onClick={() => { setOpenId(open ? null : r.id); setReason(""); }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#0D1117] truncate">
                            {a ? `${a.first_name} ${a.last_name}` : "Unlinked contractor"}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {a?.email ?? "—"} · {r.service_category ?? a?.service ?? "—"} · {r.carrier_name ?? "no carrier"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {d !== null && (
                            <span className="text-xs text-slate-500">
                              {d <= 0 ? "expired" : `${d}d left`}
                            </span>
                          )}
                          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ring-1 ${PILL[r.verification_status] ?? PILL.not_started}`}>
                            {STATUS_LABEL[r.verification_status]}
                          </span>
                        </div>
                      </div>
                    </button>

                    {open && (
                      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                          <Field label="Carrier" value={r.carrier_name ?? "—"} />
                          <Field label="Policy" value={maskPolicy(r.policy_number)} />
                          <Field label="Coverage" value={r.coverage_type ?? "general_liability"} />
                          <Field label="Per occurrence" value={r.per_occurrence_limit_cents ? usd(r.per_occurrence_limit_cents) : "—"} />
                          <Field label="Aggregate" value={r.aggregate_limit_cents ? usd(r.aggregate_limit_cents) : "—"} />
                          <Field label="Effective" value={r.effective_date ?? "—"} />
                          <Field label="Expires" value={r.expiration_date ?? "—"} />
                          <Field label="Additional Insured" value={r.additional_insured_status} />
                          <Field label="Provider" value={r.provider} />
                        </dl>

                        <Button size="sm" variant="outline" disabled={!r.certificate_path} onClick={() => void openCoi(r.certificate_path)}>
                          <FileText className="mr-1.5 h-3.5 w-3.5" /> View COI
                        </Button>

                        <Textarea
                          rows={2}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Internal reason (required to request an update, reject or waive)"
                          className="text-sm"
                        />

                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" disabled={!!busy} onClick={() => void decide(r, "approve")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void decide(r, "request_update")}>
                            Request Updated Documentation
                          </Button>
                          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void decide(r, "reject")} className="text-rose-600 border-rose-200 hover:bg-rose-50">
                            Reject
                          </Button>
                          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void decide(r, "waive")} className="text-sky-700 border-sky-200 hover:bg-sky-50">
                            Waive (audited)
                          </Button>
                        </div>

                        {audit.length > 0 && (
                          <div className="rounded-xl bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Verification history</p>
                            <ul className="mt-2 space-y-1 text-xs text-slate-600">
                              {audit.map((h) => (
                                <li key={h.id}>
                                  {new Date(h.created_at).toLocaleString()} · {h.action}
                                  {h.to_status ? ` → ${h.to_status}` : ""}{h.reason ? ` · ${h.reason}` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Requirements by service category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-xs text-slate-500">
              These values drive /apply, the contractor dashboard and expiration reminders. No code
              changes needed.
            </p>
            {requirements.map((r, i) => (
              <div key={r.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                <p className="font-semibold text-[#0D1117] capitalize">{r.service_category}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Per occurrence (USD)</Label>
                    <Input
                      inputMode="numeric"
                      value={Math.round(r.per_occurrence_limit_cents / 100)}
                      onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value.replace(/[^0-9]/g, "")) || 0) * 100;
                        setRequirements((prev) => prev.map((x, xi) => (xi === i ? { ...x, per_occurrence_limit_cents: v } : x)));
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Aggregate (USD)</Label>
                    <Input
                      inputMode="numeric"
                      value={Math.round(r.aggregate_limit_cents / 100)}
                      onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value.replace(/[^0-9]/g, "")) || 0) * 100;
                        setRequirements((prev) => prev.map((x, xi) => (xi === i ? { ...x, aggregate_limit_cents: v } : x)));
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Reminder days (comma separated)</Label>
                    <Input
                      value={(r.reminder_days ?? []).join(", ")}
                      onChange={(e) => {
                        const days = e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
                        setRequirements((prev) => prev.map((x, xi) => (xi === i ? { ...x, reminder_days: days } : x)));
                      }}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.additional_insured_required}
                      onChange={(e) => setRequirements((prev) => prev.map((x, xi) => (xi === i ? { ...x, additional_insured_required: e.target.checked } : x)))}
                    />
                    Additional Insured required
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.manual_verification_required}
                      onChange={(e) => setRequirements((prev) => prev.map((x, xi) => (xi === i ? { ...x, manual_verification_required: e.target.checked } : x)))}
                    />
                    Manual verification required
                  </label>
                  <Button size="sm" onClick={() => void saveRequirement(r)}>Save</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#0D1117]">{value}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-[#0D1117] break-words">{value}</dd>
    </div>
  );
}
