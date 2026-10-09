/** Lawn job card: size band, Tidy-measured turf area, visit pay, and the call-Tidy rule. */
import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LAWN_SIZE_NAMES, type CanonSize } from "@/lib/pricing-canon";
import { money } from "@/lib/pro-pay";

const TIDY_PHONE = "(786) 829-1141";
const TIDY_TEL = "tel:+17868291141";

export function lawnSizeLine(size: number | null, sqft: number | null): string {
  const name = size && LAWN_SIZE_NAMES[size as CanonSize] ? LAWN_SIZE_NAMES[size as CanonSize] : "Size not set";
  return sqft ? `${name} · ~${sqft.toLocaleString("en-US")} sq ft` : `${name} · not yet measured`;
}

export default function LawnJobSize({ visitId, fallbackPayCents }: { visitId: string; fallbackPayCents: number | null }) {
  const [info, setInfo] = useState<{ size_tier: number | null; measured_sqft: number | null; visit_pay_cents: number | null } | null>(null);
  useEffect(() => {
    void supabase.rpc("pro_lawn_job_info", { _visit: visitId }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setInfo(row ?? { size_tier: null, measured_sqft: null, visit_pay_cents: fallbackPayCents });
    });
  }, [visitId, fallbackPayCents]);
  if (!info) return null;
  return (
    <div className="mt-3 rounded-xl border border-[hsl(var(--pro-line,214_32%_91%))] bg-white p-3" data-testid="lawn-job-size">
      <p className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">{lawnSizeLine(info.size_tier, info.measured_sqft)}</p>
      <p className="text-[13px] text-[hsl(var(--pro-ink-soft))]">Visit pay for this size: <strong>{money(info.visit_pay_cents ?? fallbackPayCents)}</strong></p>
      <p className="mt-2 text-[13px] leading-snug text-[hsl(var(--pro-ink))]">
        Bigger than this on arrival? Don't cut it short and don't absorb it — call Tidy.{" "}
        <a href={TIDY_TEL} className="inline-flex min-h-[44px] items-center gap-1 font-bold text-primary underline"><Phone className="h-4 w-4" aria-hidden="true" />{TIDY_PHONE}</a>
      </p>
    </div>
  );
}
