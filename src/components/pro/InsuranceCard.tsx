/**
 * Insurance — contractor-facing status card for the Pro dashboard.
 *
 * Verified → carrier + expiration + "Manage Coverage".
 * Expiring soon → renewal prompt.
 * Expired → "Update your coverage to continue accepting Tidy jobs." The account
 * stays fully accessible; only job eligibility is affected.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, Loader2, ExternalLink } from "lucide-react";
import {
  FALLBACK_CONFIG, fetchInsuranceConfig, STATUS_LABEL,
  type InsuranceConfig, type InsuranceStatus,
} from "@/lib/insurance";

type Row = {
  id: string;
  carrier_name: string | null;
  expiration_date: string | null;
  verification_status: InsuranceStatus;
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
        .select("id, carrier_name, expiration_date, verification_status")
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
  const verified = status === "verified";
  const alert = expiring || expired;

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
          {verified ? "✓ Verified" : STATUS_LABEL[status]}
        </span>
      </div>

      {expired ? (
        <p className="mt-3 text-sm text-ink leading-relaxed">
          <span className="font-semibold">Insurance Expired.</span> Update your coverage to continue accepting Tidy jobs.
        </p>
      ) : expiring ? (
        <p className="mt-3 text-sm text-ink leading-relaxed">
          <span className="font-semibold">Insurance Renewal Required Soon.</span>{" "}
          Your coverage expires {row?.expiration_date ?? "soon"}.
        </p>
      ) : verified ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Carrier</dt>
            <dd className="text-ink">{row?.carrier_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Expiration</dt>
            <dd className="text-ink">{row?.expiration_date ?? "—"}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-ink-faint leading-relaxed">
          Active Tidy Pros maintain liability coverage while performing services through Tidy.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/apply">
            {expired ? "Update Insurance" : alert ? "Renew / Update Coverage" : "Manage Coverage"}
          </Link>
        </Button>
        {config.thimble.enabled && (expired || expiring || !verified) && (
          <Button size="sm" variant="outline" onClick={() => window.open(config.thimble.partner_url, "_blank", "noopener,noreferrer")}>
            Get Covered with Thimble <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
