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
      <Card className="border-slate-200">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-full" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        </CardContent>
      </Card>
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
      <Card className="overflow-hidden border-0 shadow-lg">
        <CardContent
          className="p-0"
          style={{
            background: "linear-gradient(135deg, #f5c518 0%, #fde68a 50%, #f5c518 100%)",
          }}
        >
          <div className="p-6 sm:p-7 text-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-slate-900/90 p-2.5 shadow-md">
                  <Award className="h-6 w-6 text-amber-300" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                    My Tier
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
                    Tidy Pro Partner
                  </h2>
                  <p className="text-sm text-slate-800/90 mt-0.5">
                    Tier 2 — earned {advancedDate}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <Stat label="Total visits" value={`${data.completed_visits}`} />
              <Stat label="Rating" value={(data.avg_customer_rating ?? 0).toFixed(1)} />
              <Stat label="Days at T2" value={`${days}`} />
            </div>
            <Link
              to="/pro/tier-progression"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:underline"
            >
              View my Pro Partner perks <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Tier 1
  const visits = data.completed_visits ?? 0;
  const pct = Math.min(100, Math.round((visits / 50) * 100));
  const criteria = buildCriteria(data);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-900 p-2.5">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                My Tier
              </p>
              <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                Tidy Verified Pro
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Tier 1 of 2</p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-600">
              {visits} / 50 visits to Pro Partner readiness
            </span>
            <span className="text-xs font-semibold text-slate-900">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2 bg-slate-100" />
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {criteria.map((c) => (
            <CriterionBadge key={c.label} {...c} />
          ))}
        </div>

        <Link
          to="/pro/tier-progression"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:underline"
        >
          Learn about Pro Partner status <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
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
