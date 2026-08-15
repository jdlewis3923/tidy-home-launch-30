/**
 * Insurance verification — inside the existing applicant review drawer.
 *
 * Shows carrier, policy number, limits, dates, Additional Insured status and a
 * signed (short-lived) link to the private COI. Admins can Approve, Request
 * Update, or Reject; the last two require an internal reason. Decisions go
 * through the `insurance-decision` edge function, which records who acted.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText, Loader2, ShieldCheck } from "lucide-react";
import { STATUS_LABEL, usd, type InsuranceStatus } from "@/lib/insurance";

type Row = {
  id: string;
  provider: string;
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
  verified_by: string | null;
  rejection_reason: string | null;
  created_at: string;
};

const PILL: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  pending_verification: "bg-amber-100 text-amber-700 ring-amber-200",
  update_requested: "bg-amber-100 text-amber-700 ring-amber-200",
  rejected: "bg-rose-100 text-rose-700 ring-rose-200",
  expired: "bg-rose-100 text-rose-700 ring-rose-200",
  expiring_soon: "bg-amber-100 text-amber-700 ring-amber-200",
  not_started: "bg-slate-100 text-slate-500 ring-slate-200",
};

const AI_LABEL: Record<string, string> = {
  unknown: "Not sure",
  not_listed: "Not listed",
  requested: "Requested from carrier",
  listed: "Listed",
  not_applicable: "Not applicable",
};

export default function InsurancePanel({ applicantId }: { applicantId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("contractor_insurance")
      .select("*")
      .eq("applicant_id", applicantId)
      .order("created_at", { ascending: false })
      .limit(1);
    setRow(((data ?? [])[0] as Row) ?? null);
    setLoading(false);
  }, [applicantId]);

  useEffect(() => { void load(); }, [load]);

  const openCoi = async () => {
    if (!row?.certificate_path) return;
    const { data, error } = await supabase.storage
      .from("contractor-coi-pdfs")
      .createSignedUrl(row.certificate_path, 300);
    if (error || !data?.signedUrl) { toast.error("Could not open certificate"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const decide = async (decision: "approve" | "request_update" | "reject") => {
    if (!row) return;
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

  return (
    <Card className="rounded-2xl border-slate-200">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[#0D1117] flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#1FA1F0]" /> Insurance
          </h3>
          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ring-1 ${PILL[row?.verification_status ?? "not_started"]}`}>
            {STATUS_LABEL[(row?.verification_status ?? "not_started") as InsuranceStatus]}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</p>
        ) : !row ? (
          <p className="text-sm text-slate-500">No insurance submitted yet.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Carrier" value={row.carrier_name ?? "—"} />
              <Field label="Policy number" value={row.policy_number ?? "—"} />
              <Field label="Per occurrence" value={row.per_occurrence_limit_cents ? usd(row.per_occurrence_limit_cents) : "—"} />
              <Field label="Aggregate" value={row.aggregate_limit_cents ? usd(row.aggregate_limit_cents) : "—"} />
              <Field label="Effective" value={row.effective_date ?? "—"} />
              <Field label="Expires" value={row.expiration_date ?? "—"} />
              <Field label="Additional Insured" value={AI_LABEL[row.additional_insured_status] ?? row.additional_insured_status} />
              <Field label="Provider" value={row.provider === "thimble" ? "Thimble (Tidy preferred)" : "Other carrier"} />
            </dl>

            {row.rejection_reason && (
              <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                Internal note: {row.rejection_reason}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={!row.certificate_path} onClick={openCoi}>
                <FileText className="mr-1.5 h-3.5 w-3.5" /> View COI
              </Button>
            </div>

            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Internal reason (required to request an update or reject)"
              className="text-sm"
            />

            <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
              <Button size="sm" disabled={!!busy} onClick={() => decide("approve")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Approve Coverage"}
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decide("request_update")}>
                {busy === "request_update" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Request Update"}
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decide("reject")} className="text-rose-600 border-rose-200 hover:bg-rose-50">
                {busy === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reject Coverage"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
