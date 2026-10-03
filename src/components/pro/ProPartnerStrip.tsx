import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { REVIEW_BONUS_LINE } from "@/lib/reviewBonus";

/** Running review-bonus total for the signed-in Pro (cents). */
export function useReviewBonusTotal() {
  const [c, setC] = useState<number | null>(null);
  useEffect(() => {
    void supabase.rpc("pro_review_bonus_total").then(({ data }) => setC(typeof data === "number" ? data : 0));
  }, []);
  return c;
}

function ReviewBonusLine() {
  const c = useReviewBonusTotal();
  return (
    <div className="mt-2 rounded-2xl border border-border bg-card px-4 py-2.5" data-testid="review-bonus-total">
      <p className="text-[14px] font-bold text-foreground">Review bonuses earned: ${((c ?? 0) / 100).toFixed(0)}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{REVIEW_BONUS_LINE}</p>
    </div>
  );
}

export type ProPartnerStatus = {
  tier: string; visits: number; visits_needed: number; visits_met: boolean;
  rating: number | null; rating_met: boolean; days_active: number; days_met: boolean;
  redos_60d: number; redo_hold: boolean; all_met: boolean;
};

export function useProPartner() {
  const [s, setS] = useState<ProPartnerStatus | null>(null);
  useEffect(() => {
    void supabase.rpc("pro_partner_progress").then(({ data }) => setS((data as ProPartnerStatus | null) ?? null));
  }, []);
  return s;
}

/** "38 of 50 visits toward Pro Partner." — used in the weekly pay summary. */
export function proPartnerCountLine(s: ProPartnerStatus | null): string | null {
  if (!s || s.tier === "tier_2_pro_partner") return null;
  return `${Math.min(s.visits, 50)} of 50 visits toward Pro Partner.`;
}

/** First thing a Pro sees: progress to the 10% raise. Applies automatically. */
export default function ProPartnerStrip() {
  const s = useProPartner();
  if (!s) return null;
  if (s.tier === "tier_2_pro_partner") {
    return (
      <section className="px-[18px] pt-4" data-testid="pro-partner-strip">
        <div className="rounded-2xl border border-border bg-card px-4 py-3">
          <p className="text-[15px] font-bold text-foreground">Pro Partner · your 10% raise is live</p>
        </div>
        <ReviewBonusLine />
      </section>
    );
  }
  const left = Math.max(0, 50 - s.visits);
  const headline = left > 0 ? `${left} visit${left === 1 ? "" : "s"} to your 10% raise.` : "Visits done — your 10% raise is close.";
  const items = [
    { label: `${Math.min(s.visits, 50)}/50 completed visits`, met: s.visits_met },
    { label: `${s.rating != null ? Number(s.rating).toFixed(1) : "—"} / 4.8 average rating`, met: s.rating_met },
    { label: `${Math.min(s.days_active, 60)}/60 days active`, met: s.days_met },
  ];
  return (
    <section className="px-[18px] pt-4" data-testid="pro-partner-strip">
      <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
        <p className="text-[17px] font-extrabold text-foreground">{headline}</p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (s.visits / 50) * 100)}%` }} />
        </div>
        <ul className="mt-3 space-y-1.5">
          {items.map((i) => (
            <li key={i.label} className={`flex items-center gap-2 text-[13px] ${i.met ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${i.met ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                {i.met && <Check className="h-3 w-3" />}
              </span>
              {i.label}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-muted-foreground">
          When all three are met, the raise applies automatically from your next visit.
          {s.redo_hold && " On hold while you have more than 2 redos in the last 60 days."}
        </p>
      </div>
      <ReviewBonusLine />
    </section>
  );
}
