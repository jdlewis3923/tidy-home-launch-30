/**
 * ReviewBonusCard — self-contained Pro-facing card showing this month's
 * named 5-star review bonus progress: count toward the monthly cap,
 * bonuses earned so far, and cap remaining. Reads directly from
 * public.reviews / public.pro_bonuses (RLS: Pro can read their own rows).
 */
import { useEffect, useState } from "react";
import { Star, Gift, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";

type Policy = { amount_cents: number; cap_per_month: number };

function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function ReviewBonusCard() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [proId, setProId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Policy>({ amount_cents: 2500, cap_per_month: 4 });
  const [countedThisMonth, setCountedThisMonth] = useState(0);
  const [earnedCents, setEarnedCents] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (!userId) { setLoading(false); return; }

      const { data: applicant } = await supabase
        .from("applicants")
        .select("id")
        .eq("contractor_id", userId)
        .maybeSingle();
      if (!applicant?.id) { setLoading(false); return; }
      if (cancelled) return;
      setProId(applicant.id);

      const { data: policySetting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "review_bonus")
        .maybeSingle();
      const p = policySetting?.value as Partial<Policy> | undefined;
      if (!cancelled && p) {
        setPolicy({
          amount_cents: p.amount_cents ?? 2500,
          cap_per_month: p.cap_per_month ?? 4,
        });
      }

      const period = currentPeriod();
      const monthStart = `${period}-01T00:00:00.000Z`;

      const [{ count }, { data: bonuses }, { count: pendCount }] = await Promise.all([
        supabase
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("matched_pro_id", applicant.id)
          .in("status", ["awaiting_approval", "approved", "paid"])
          .gte("posted_at", monthStart),
        supabase
          .from("pro_bonuses")
          .select("amount_cents, status")
          .eq("pro_id", applicant.id)
          .eq("period", period),
        supabase
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("matched_pro_id", applicant.id)
          .eq("status", "matched"),
      ]);

      if (cancelled) return;
      setCountedThisMonth(count ?? 0);
      setEarnedCents((bonuses ?? []).reduce((sum, b) => sum + (b.amount_cents ?? 0), 0));
      setPendingCount(pendCount ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!proId) return null;

  const capRemaining = Math.max(0, policy.cap_per_month - countedThisMonth);
  const pct = Math.min(100, Math.round((countedThisMonth / Math.max(1, policy.cap_per_month)) * 100));

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-blue-50 via-white to-white shadow-[0_10px_40px_-15px_rgba(37,99,235,0.25)]">
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-deep p-2.5 shadow-[0_8px_24px_rgba(37,99,235,0.35)]">
            <Star className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              {t("Review Bonus")}
            </p>
            <h3 className="font-display text-lg font-bold text-navy leading-tight">
              {t("This month's 5-star reviews")}
            </h3>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-medium text-slate-700">
              {countedThisMonth} / {policy.cap_per_month} {t("counted toward your monthly cap")}
            </span>
            <span className="font-display text-lg font-bold text-primary tabular-nums">{pct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-blue-400 to-primary-deep transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-emerald-800">
              <Gift className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wide">{t("Bonuses earned")}</span>
            </div>
            <p className="font-display text-xl font-bold text-emerald-900 mt-1 tabular-nums">
              ${(earnedCents / 100).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-slate-600">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wide">{t("Cap remaining")}</span>
            </div>
            <p className="font-display text-xl font-bold text-navy mt-1 tabular-nums">{capRemaining}</p>
          </div>
        </div>

        {pendingCount > 0 && (
          <p className="mt-4 text-xs text-slate-500">
            {t("Plus")} {pendingCount} {t("more matched review(s) still in the 7-day hold period.")}
          </p>
        )}

        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
          {t(
            "$25 per 5-star Google review that names you, capped at 4 per calendar month (up to $100). Paid 7 days after the review posts, on your Friday deposit. The cap does not roll over.",
          )}
        </p>

      </CardContent>
    </Card>
  );
}
