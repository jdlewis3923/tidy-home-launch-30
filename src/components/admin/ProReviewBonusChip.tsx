/** Running review-bonus total on a Pro's admin record. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function ProReviewBonusChip({ proId }: { proId: string }) {
  const [c, setC] = useState<number | null>(null);
  useEffect(() => {
    void supabase.rpc("pro_review_bonus_total", { _pro: proId }).then(({ data }) => setC(typeof data === "number" ? data : 0));
  }, [proId]);
  return (
    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 bg-amber-50 text-amber-800 ring-amber-200" data-testid="pro-review-bonus-total">
      Review bonuses: ${((c ?? 0) / 100).toFixed(0)}
    </span>
  );
}
