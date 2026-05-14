/**
 * MyTierWidget — Pro app dashboard widget that surfaces a contractor's
 * current tier (Tidy Verified Pro vs. Tidy Pro Partner) and their
 * progress toward the next one. Designed to gamify the Tier 1 → Tier 2
 * journey using the live `applicants` row for the logged-in Pro.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award, ShieldCheck, Star, ArrowRight, Check, Clock, Camera,
  AlertOctagon, XCircle, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

type ProRow = {
  id: string;
  first_name: string;
  tier: "tier_1_verified" | "tier_2_pro_partner";
  tier_advanced_at: string | null;
  completed_visits: number;
  avg_customer_rating: number | null;
  contractor_cancel_rate: number | null;
  complaint_rate: number | null;
  photo_compliance_rate: number | null;
  open_escalations_count: number;
};

type Criterion = {
  icon: React.ReactNode;
  label: string;
  value: string;
  met: boolean;
  progressing?: boolean;
};

function buildCriteria(p: ProRow): Criterion[] {
  const visits = p.completed_visits ?? 0;
  const rating = p.avg_customer_rating ?? 0;
  const cancel = p.contractor_cancel_rate ?? 1;
  const complaint = p.complaint_rate ?? 1;
  const photo = p.photo_compliance_rate ?? 0;
  const esc = p.open_escalations_count ?? 0;
  return [
    {
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      label: "Visits",
      value: `${visits}/50`,
      met: visits >= 50,
      progressing: visits > 0 && visits < 50,
    },
    { icon: <Star className="h-3.5 w-3.5" />, label: "Rating", value: rating.toFixed(1), met: rating >= 4.8 },
    { icon: <XCircle className="h-3.5 w-3.5" />, label: "Cancel rate", value: `${(cancel * 100).toFixed(0)}%`, met: cancel < 0.05 },
    { icon: <AlertOctagon className="h-3.5 w-3.5" />, label: "Complaints", value: `${(complaint * 100).toFixed(0)}%`, met: complaint < 0.02 },
    { icon: <Camera className="h-3.5 w-3.5" />, label: "Photo compliance", value: `${(photo * 100).toFixed(0)}%`, met: photo >= 0.95 },
    { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "Open escalations", value: `${esc}`, met: esc === 0 },
  ];
}

export default function MyTierWidget() {
  const [pro, setPro] = useState<ProRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const email = sess.session?.user?.email;
      if (!email) { setLoading(false); return; }
      const { data } = await supabase
        .from("applicants")
        .select("id, first_name, tier, tier_advanced_at, completed_visits, avg_customer_rating, contractor_cancel_rate, complaint_rate, photo_compliance_rate, open_escalations_count")
        .eq("email", email.toLowerCase())
        .maybeSingle();
      if (!cancelled) {
        setPro((data as ProRow | null) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="space-y-4">
          <Skeleton className="h-6 w-48 bg-white/10" />
          <Skeleton className="h-3 w-full bg-white/10" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full bg-white/10" />)}
          </div>
        </div>
      </div>
    );
  }

  // Demo fallback so the widget still tells a story when the logged-in
  // user isn't yet linked to an applicants row. ?demo=tier2 forces the
  // Pro Partner state for screenshots / previews.
  const demoTier2 = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "tier2";
  const data: ProRow = pro ?? (demoTier2 ? {
    id: "demo",
    first_name: "Pro",
    tier: "tier_2_pro_partner",
    tier_advanced_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 47).toISOString(),
    completed_visits: 128,
    avg_customer_rating: 4.9,
    contractor_cancel_rate: 0.01,
    complaint_rate: 0,
    photo_compliance_rate: 0.99,
    open_escalations_count: 0,
  } : {
    id: "demo",
    first_name: "Pro",
    tier: "tier_1_verified",
    tier_advanced_at: null,
    completed_visits: 42,
    avg_customer_rating: 4.9,
    contractor_cancel_rate: 0.02,
    complaint_rate: 0,
    photo_compliance_rate: 0.98,
    open_escalations_count: 0,
  });

  if (data.tier === "tier_2_pro_partner") {
    const advancedDate = data.tier_advanced_at
      ? new Date(data.tier_advanced_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";
    const days = data.tier_advanced_at
      ? Math.max(0, Math.floor((Date.now() - new Date(data.tier_advanced_at).getTime()) / 86400000))
      : 0;
    return (
      <div className="relative overflow-hidden rounded-2xl shadow-[0_30px_80px_-20px_rgba(245,197,24,0.5)]">
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, #f5c518 0%, #fde68a 45%, #f5c518 100%)" }}
        />
        <div aria-hidden className="absolute inset-0 opacity-30" style={{
          backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.4), transparent 40%)",
        }} />
        <div className="relative p-6 sm:p-8 text-navy">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-navy p-3 shadow-lg">
                <Award className="h-6 w-6 text-gold" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-navy/80">My Tier · Elite</p>
                <h2 className="font-display text-3xl sm:text-4xl font-bold leading-tight">
                  Tidy Pro Partner
                </h2>
                <p className="text-sm font-medium text-navy/70 mt-0.5">Earned {advancedDate}</p>
              </div>
            </div>
            <Link
              to="/pro/tier-progression"
              className="inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-xs font-bold uppercase tracking-wider text-gold hover:bg-navy-deep transition"
            >
              Pro Partner perks <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Total visits" value={`${data.completed_visits}`} />
            <Stat label="Rating" value={(data.avg_customer_rating ?? 0).toFixed(1)} />
            <Stat label="Days at T2" value={`${days}`} />
          </div>
        </div>
      </div>
    );
  }

  // Tier 1
  const visits = data.completed_visits ?? 0;
  const pct = Math.min(100, Math.round((visits / 50) * 100));
  const criteria = buildCriteria(data);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.04] to-transparent p-6 sm:p-7 backdrop-blur-md shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
      <div aria-hidden className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-gold to-amber-400 p-3 shadow-[0_8px_24px_rgba(245,197,24,0.4)]">
            <ShieldCheck className="h-6 w-6 text-navy" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">My Tier · 1 of 2</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">
              Tidy Verified Pro
            </h2>
            <p className="text-sm text-white/60 mt-0.5">On the path to Pro Partner</p>
          </div>
        </div>
        <Link
          to="/pro/tier-progression"
          className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gold hover:bg-gold hover:text-navy transition"
        >
          Pro Partner playbook <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="relative mt-6">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-medium text-white/70">
            {visits} / 50 visits to Pro Partner readiness
          </span>
          <span className="font-display text-lg font-bold text-gold tabular-nums">{pct}%</span>
        </div>
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold via-amber-300 to-gold transition-[width] duration-1000 ease-out shadow-[0_0_20px_rgba(245,197,24,0.6)]"
            style={{ width: `${pct}%` }}
          />
          <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {criteria.map((c) => (
          <CriterionBadge key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/10 backdrop-blur px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">{label}</p>
      <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
    </div>
  );
}

function CriterionBadge({ icon, label, value, met, progressing }: Criterion) {
  const tone = met
    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : progressing
      ? "bg-amber-50 border-amber-200 text-amber-800"
      : "bg-slate-50 border-slate-200 text-slate-600";
  const Icon = met ? Check : progressing ? Clock : icon;
  return (
    <div className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 ${tone}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0">
          {met ? <Check className="h-3.5 w-3.5" /> : progressing ? <Clock className="h-3.5 w-3.5" /> : icon}
        </span>
        <span className="text-[11px] font-medium truncate">{label}</span>
      </div>
      <span className="text-[11px] font-bold tabular-nums shrink-0">{value}</span>
    </div>
  );
}
