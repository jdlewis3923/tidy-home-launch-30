/**
 * Insurance — contractor-facing status card for the Pro dashboard.
 *
 * Verified → carrier, masked policy number, coverage, dates, Additional Insured.
 * Expiring soon → renewal prompt with the expiration date shown prominently.
 * Expired → "Insurance Expired": new jobs can't be accepted until qualifying
 * coverage is verified. The account stays fully accessible; only job eligibility
 * is affected. Internal admin notes are never shown here.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, Loader2, ExternalLink } from "lucide-react";
import {
  FALLBACK_CONFIG, STATUS_LABEL, fetchInsuranceConfig, maskPolicy, preferredProvider, usd,
  type InsuranceConfig, type InsuranceStatus,
} from "@/lib/insurance";

type Row = {
  id: string;
  carrier_name: string | null;
  policy_number: string | null;
  coverage_type: string | null;
  per_occurrence_limit_cents: number | null;
  effective_date: string | null;
  expiration_date: string | null;
  additional_insured_status: string | null;
  verification_status: InsuranceStatus;
};

const AI_LABEL: Record<string, string> = {
  unknown: "Not confirmed",
  not_listed: "Not listed",
  requested: "Requested",
  listed: "Listed",
  not_applicable: "Not applicable",
};

export default function InsuranceCard() {
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<InsuranceConfig>(FALLBACK_CONFIG);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { if (alive) setLoading(false); return; }
      const { data } = await supabase
        .from("contractor_insurance")
        .select("id, carrier_name, policy_number, coverage_type, per_occurrence_limit_cents, effective_date, expiration_date, additional_insured_status, verification_status")
        .eq("contractor_id", uid)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!alive) return;
      setRow(((data ?? [])[0] as Row) ?? null);
      setLoading(false);
    })();
    fetchInsuranceConfig().then((c) => { if (alive) setConfig(c); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-5 text-sm text-ink-faint flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading insurance…
      </div>
    );
  }

  const status: InsuranceStatus = row?.verification_status ?? "not_started";
  const expiring = status === "expiring_soon";
  const expired = status === "expired";
  const verified = status === "verified" || status === "waived";
  const alert = expiring || expired;
  const provider = preferredProvider(config);
  const providerUrl = provider?.embed_url || provider?.referral_url || "";

  return (
    <div className={`rounded-2xl border p-5 ${alert ? "border-amber-300 bg-amber-50" : "border-hairline bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {alert ? <ShieldAlert className="h-5 w-5 text-amber-600" /> : <ShieldCheck className="h-5 w-5 text-primary" />}
          <h3 className="font-display text-lg font-bold text-navy">Insurance</h3>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
          verified ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
          : alert ? "bg-amber-100 text-amber-700 ring-amber-200"
          : "bg-slate-100 text-slate-600 ring-slate-200"
        }`}>
          {status === "verified" ? "✓ Verified" : STATUS_LABEL[status]}
        </span>
      </div>

      {expired ? (
        <p className="mt-3 text-sm text-ink leading-relaxed">
          <span className="font-semibold">Insurance Expired.</span> New jobs can't be accepted until
          qualifying coverage is verified. Your account, history and earnings stay exactly as they are.
        </p>
      ) : expiring ? (
        <p className="mt-3 text-sm text-ink leading-relaxed">
          <span className="font-semibold">Renewal Required Soon.</span>{" "}
          Your coverage expires <span className="font-semibold">{row?.expiration_date ?? "soon"}</span>.
        </p>
      ) : verified ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Field label="Carrier" value={row?.carrier_name ?? "—"} />
          <Field label="Policy" value={maskPolicy(row?.policy_number)} />
          <Field
            label="Coverage"
            value={row?.per_occurrence_limit_cents ? `${usd(row.per_occurrence_limit_cents)} per occurrence` : (row?.coverage_type ?? "General liability")}
          />
          <Field label="Effective" value={row?.effective_date ?? "—"} />
          <Field label="Expiration" value={row?.expiration_date ?? "—"} />
          <Field label="Additional Insured" value={AI_LABEL[row?.additional_insured_status ?? "unknown"] ?? "—"} />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-ink-faint leading-relaxed">
          Active Tidy Pros maintain qualifying liability coverage while performing services through Tidy.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/apply">
            {expired ? "Restore Coverage" : expiring ? "Renew Coverage" : verified ? "View / Update Coverage" : "Add Coverage"}
          </Link>
        </Button>
        {provider?.enabled && providerUrl && (expired || expiring || !verified) && (
          <Button size="sm" variant="outline" onClick={() => window.open(providerUrl, "_blank", "noopener,noreferrer")}>
            Get Covered with {provider.display_name} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-ink break-words">{value}</dd>
    </div>
  );
}
