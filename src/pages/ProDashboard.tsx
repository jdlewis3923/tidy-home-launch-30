/**
 * Pro Dashboard — /pro
 *
 * Light, welcoming contractor console. White canvas, navy ink, Tidy
 * blue accents, gold for tier moments. All values are wired to live
 * Supabase tables (applicants, pro_visits, today_visits, google_reviews,
 * stripe_payouts, pro_referrals) with realtime subscriptions so updates
 * land without refresh.
 */
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import {
  Calendar, DollarSign, Camera, ChevronRight, MapPin, Sparkles,
  TrendingUp, Users, Bell, Clock, ArrowUpRight, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import MyTierWidget from "@/components/pro/MyTierWidget";
import { Skeleton } from "@/components/ui/skeleton";
import AnimatedNumber from "@/components/motion/AnimatedNumber";
import tidyLogo from "@/assets/tidy-logo.png";

type DashboardData = {
  firstName: string;
  referralCode: string;
  todayCount: number;
  nextVisit: { time: string; label: string; address: string } | null;
  weekCents: number;
  lastWeekCents: number;
  rating30d: number;
  ratingCount: number;
  streakDays: number;
  weekPayoutCents: number;
  nextPayoutDay: string;
  photosPending: number;
  referralCount: number;
  referralBonusCents: number;
};

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // make Monday start
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function ProDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [now, setNow] = useState(new Date());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let channels: Array<ReturnType<typeof supabase.channel>> = [];

    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) { setAuthed(false); return; }
      setAuthed(true);

      const userId = user.id;
      const meta = (user.user_metadata ?? {}) as Record<string, string>;
      const fallbackName = meta.first_name || user.email?.split("@")[0] || "Pro";

      const fetchAll = async () => {
        const weekStart = startOfWeek(new Date()).toISOString();
        const lastWeekStart = startOfWeek(new Date(Date.now() - 7 * 86400000)).toISOString();
        const lastWeekEnd = startOfWeek(new Date()).toISOString();
        const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

        const [
          appRes, profRes, todayRes, weekRes, lastWeekRes, ratingRes,
          payoutRes, photoRes, refRes, bonusRes,
        ] = await Promise.all([
          supabase.from("applicants")
            .select("first_name, tier, tier_advanced_at")
            .eq("contractor_id", userId).maybeSingle(),
          supabase.from("profiles")
            .select("first_name, referral_code")
            .eq("user_id", userId).maybeSingle(),
          supabase.from("today_visits")
            .select("scheduled_at, customer_name, address_line1, city, service_type, distance_miles")
            .eq("contractor_id", userId)
            .gte("scheduled_at", todayStart.toISOString())
            .lte("scheduled_at", todayEnd.toISOString())
            .order("scheduled_at", { ascending: true }),
          supabase.from("pro_visits")
            .select("amount_cents")
            .eq("contractor_id", userId).eq("status", "complete")
            .gte("completed_at", weekStart),
          supabase.from("pro_visits")
            .select("amount_cents")
            .eq("contractor_id", userId).eq("status", "complete")
            .gte("completed_at", lastWeekStart).lt("completed_at", lastWeekEnd),
          supabase.from("google_reviews")
            .select("rating")
            .eq("contractor_id", userId).gte("posted_at", since30),
          supabase.from("stripe_payouts")
            .select("amount_cents, scheduled_at")
            .eq("contractor_id", userId)
            .order("scheduled_at", { ascending: false }).limit(1),
          supabase.from("pro_visits")
            .select("id", { count: "exact", head: true })
            .eq("contractor_id", userId).eq("status", "complete")
            .lt("photos_count", 1),
          supabase.from("pro_referrals")
            .select("id", { count: "exact", head: true })
            .eq("referrer_contractor_id", userId).eq("status", "completed"),
          supabase.from("app_settings")
            .select("value").eq("key", "referral_bonus_amount_cents").maybeSingle(),
        ]);


        if (cancelled) return;

        const weekCents = (weekRes.data ?? []).reduce((s: number, r: any) => s + (r.amount_cents ?? 0), 0);
        const lastWeekCents = (lastWeekRes.data ?? []).reduce((s: number, r: any) => s + (r.amount_cents ?? 0), 0);
        const ratings = (ratingRes.data ?? []).map((r: any) => r.rating).filter(Boolean);
        const rating30d = ratings.length ? ratings.reduce((s: number, n: number) => s + n, 0) / ratings.length : 0;

        const nextVisit = (todayRes.data ?? []).find((v: any) => new Date(v.scheduled_at) >= new Date()) ?? (todayRes.data ?? [])[0];
        const payout = (payoutRes.data ?? [])[0];
        const nextPayoutDay = payout?.scheduled_at
          ? new Date(payout.scheduled_at).toLocaleDateString("en-US", { weekday: "long" })
          : "Friday";

        // Streak: simple — consecutive days with completed visits ending today
        const { data: streakRows } = await supabase.from("pro_visits")
          .select("completed_at").eq("contractor_id", userId).eq("status", "complete")
          .gte("completed_at", new Date(Date.now() - 60 * 86400000).toISOString())
          .order("completed_at", { ascending: false });
        const days = new Set<string>((streakRows ?? []).map((r: any) => r.completed_at?.slice(0, 10)));
        let streak = 0;
        const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
        while (days.has(cursor.toISOString().slice(0, 10))) {
          streak += 1;
          cursor.setDate(cursor.getDate() - 1);
        }

        setData({
          firstName: appRes.data?.first_name || profRes.data?.first_name || fallbackName,
          referralCode: profRes.data?.referral_code || `TIDY-${fallbackName.slice(0, 4).toUpperCase()}`,
          todayCount: todayRes.data?.length ?? 0,
          nextVisit: nextVisit ? {
            time: fmtTime(new Date(nextVisit.scheduled_at)),
            label: `${nextVisit.service_type ?? "Visit"} · ${nextVisit.customer_name ?? "Customer"}`,
            address: [nextVisit.address_line1, nextVisit.city].filter(Boolean).join(", "),
          } : null,
          weekCents, lastWeekCents,
          rating30d, ratingCount: ratings.length,
          streakDays: streak,
          weekPayoutCents: payout?.amount_cents ?? weekCents,
          nextPayoutDay,
          photosPending: photoRes.count ?? 0,
          referralCount: refRes.count ?? 0,
          referralBonusCents: Number((bonusRes as any)?.data?.value ?? 20000),
        });
        setLoading(false);
      };

      await fetchAll();

      // Realtime — refetch on any update to relevant tables for this user.
      const wire = (table: string, filter: string) =>
        supabase.channel(`pro-${table}-${userId}`)
          .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => { fetchAll(); })
          .subscribe();

      channels = [
        wire("applicants", `contractor_id=eq.${userId}`),
        wire("pro_visits", `contractor_id=eq.${userId}`),
        wire("today_visits", `contractor_id=eq.${userId}`),
        wire("google_reviews", `contractor_id=eq.${userId}`),
        wire("stripe_payouts", `contractor_id=eq.${userId}`),
        wire("pro_referrals", `referrer_contractor_id=eq.${userId}`),
      ];
    })();

    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, []);

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, [now]);

  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  if (authed === false) return <Navigate to="/login?next=/pro" replace />;

  const wow = data && data.lastWeekCents > 0
    ? Math.round(((data.weekCents - data.lastWeekCents) / data.lastWeekCents) * 100)
    : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-navy">
      <Helmet><title>Pro Dashboard — Tidy</title></Helmet>

      {/* Soft brand atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-48 -right-32 h-[640px] w-[640px] rounded-full opacity-50"
          style={{ background: "radial-gradient(circle, hsl(217 91% 60% / 0.18) 0%, transparent 65%)", filter: "blur(60px)" }} />
        <div className="absolute top-1/2 -left-40 h-[520px] w-[520px] rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, hsl(47 93% 53% / 0.18) 0%, transparent 65%)", filter: "blur(70px)" }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: "linear-gradient(hsl(var(--navy)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--navy)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at top, black 25%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 25%, transparent 70%)",
        }} />
      </div>

      <header className="relative z-10 border-b border-slate-200/70 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
          <Link to="/" className="flex items-center gap-3 group">
            <img src={tidyLogo} alt="Tidy" className="h-12 w-auto drop-shadow-[0_4px_14px_rgba(37,99,235,0.18)] transition-transform group-hover:scale-105" />
            <div className="hidden sm:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Pro App</p>
              <p className="text-sm font-semibold text-navy -mt-0.5">Contractor Console</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold text-emerald-700">On-shift · Miami</span>
            </div>
            <button className="relative rounded-full border border-slate-200 bg-white p-2.5 text-navy hover:bg-slate-50 transition shadow-sm">
              <Bell className="h-4 w-4" />
              {data && data.photosPending > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-navy">
                  {data.photosPending}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-7xl px-4 pt-10 pb-6 sm:px-8 animate-fade-in">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">{dateLabel}</p>
        <h1 className="mt-2 font-display text-4xl sm:text-6xl font-bold leading-[1.05] text-navy">
          {greeting},<br className="sm:hidden" />{" "}
          <span className="bg-gradient-to-r from-primary via-blue-500 to-primary-deep bg-clip-text text-transparent">
            {loading ? "…" : data?.firstName}.
          </span>
        </h1>
        <p className="mt-3 max-w-xl text-base sm:text-lg text-slate-600">
          You're representing the #1 home-services brand in Miami. Here's your day.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {loading || !data ? (
            <>
              {[0,1,2,3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
            </>
          ) : (
            <>
              <HeroStat icon={<Calendar className="h-4 w-4" />} label="Today's visits"
                value={<AnimatedNumber value={data.todayCount} />}
                sub={data.nextVisit ? `Next ${data.nextVisit.time}` : "No visits scheduled"} />
              <HeroStat icon={<DollarSign className="h-4 w-4" />} label="Week to date"
                value={<>$<AnimatedNumber value={Math.round(data.weekCents / 100)} /></>}
                sub={wow === null ? "First-week baseline" : `${wow >= 0 ? "+" : ""}${wow}% vs last wk`} accent />
              <HeroStat icon={<TrendingUp className="h-4 w-4" />} label="Rating (30d)"
                value={<AnimatedNumber value={data.rating30d} format={(n) => n.toFixed(1)} />}
                sub={data.ratingCount ? `${data.ratingCount} review${data.ratingCount === 1 ? "" : "s"}` : "Awaiting reviews"} />
              <HeroStat icon={<Zap className="h-4 w-4" />} label="Streak"
                value={<><AnimatedNumber value={data.streakDays} /> {data.streakDays === 1 ? "day" : "days"}</>}
                sub={data.streakDays >= 3 ? "Don't break it" : "Build it up"} />
            </>
          )}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-6 sm:px-8">
        <MyTierWidget />
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-16 sm:px-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">Your Workspace</p>
            <h2 className="font-display text-2xl font-bold text-navy">Jump back in</h2>
          </div>
          <Link to="/pro/tier-progression" className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-deep transition">
            Tier playbook <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.nextVisit ? (
            <ModuleCard featured icon={<MapPin className="h-5 w-5" />}
              kicker={`Up next · ${data.nextVisit.time}`}
              title={data.nextVisit.label}
              body={data.nextVisit.address || "Address pending"}
              cta="Open route" href="/pro" />
          ) : (
            <ModuleCard icon={<MapPin className="h-5 w-5" />}
              kicker="Today" title="No visits scheduled"
              body="Enjoy the day off — or open availability for next week"
              cta="Open calendar" href="/pro" />
          )}
          <ModuleCard icon={<DollarSign className="h-5 w-5" />}
            kicker="Payouts"
            title={`$${data ? Math.round(data.weekPayoutCents / 100) : 0} this week`}
            body={`Next deposit ${data?.nextPayoutDay ?? "Friday"} · Stripe Express`}
            cta="View earnings" href="/pro" />
          <ModuleCard icon={<Camera className="h-5 w-5" />}
            kicker="Photo uploads"
            title={`${data?.photosPending ?? 0} visit${data?.photosPending === 1 ? "" : "s"} awaiting photos`}
            body="Upload before midnight to stay 95%+ compliant"
            cta="Upload now" href="/pro"
            urgent={!!data && data.photosPending > 0} />
          <ModuleCard icon={<Users className="h-5 w-5" />}
            kicker="Refer a Pro"
            title="Earn $200 per hire"
            body={`Your invite code: ${data?.referralCode ?? "—"}${data && data.referralCount > 0 ? ` · ${data.referralCount} hired` : ""}`}
            cta="Share invite" href="/pro" />
          <ModuleCard icon={<Sparkles className="h-5 w-5" />}
            kicker="Skills & badges"
            title="Unlock Detailing certification"
            body="Adds $20–$45 per add-on visit"
            cta="Start training" href="/pro" />
          <ModuleCard icon={<Clock className="h-5 w-5" />}
            kicker="Schedule"
            title="Set next-week availability"
            body="Lock in by Sunday 8 PM for priority routing"
            cta="Open calendar" href="/pro" />
        </div>
      </section>

      <footer className="relative z-10 border-t border-slate-200/70 py-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-8">
          <p className="text-xs text-slate-500">Tidy Home Concierge · Built for Pros, by Pros.</p>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">#1 in Miami</p>
        </div>
      </footer>
    </div>
  );
}

function HeroStat({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; accent?: boolean;
}) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-lg ${
      accent
        ? "border-primary/30 bg-gradient-to-br from-blue-50 via-white to-white shadow-[0_8px_28px_-12px_rgba(37,99,235,0.35)]"
        : "border-slate-200 bg-white shadow-sm hover:border-primary/30"
    }`}>
      <div className="flex items-center gap-2 text-slate-600">
        <span className={accent ? "text-primary" : "text-slate-400"}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{label}</span>
      </div>
      <p className="mt-2 font-display text-3xl font-bold text-navy tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
    </div>
  );
}

function ModuleCard({ icon, kicker, title, body, cta, href, featured, urgent }: {
  icon: React.ReactNode; kicker: string; title: string; body: string; cta: string;
  href: string; featured?: boolean; urgent?: boolean;
}) {
  return (
    <Link to={href} className={`group relative overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-1 hover:shadow-xl ${
      featured
        ? "border-primary/30 bg-gradient-to-br from-blue-50 via-white to-white shadow-[0_8px_30px_-12px_rgba(37,99,235,0.35)]"
        : urgent
          ? "border-gold/40 bg-gradient-to-br from-amber-50 via-white to-white"
          : "border-slate-200 bg-white shadow-sm hover:border-primary/30"
    }`}>
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${
          featured ? "bg-primary text-white" : urgent ? "bg-gold text-navy" : "bg-slate-100 text-navy"
        }`}>{icon}</div>
        <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-primary" />
      </div>
      <p className={`mt-4 text-[10px] font-bold uppercase tracking-[0.22em] ${urgent ? "text-amber-700" : "text-primary"}`}>{kicker}</p>
      <h3 className="mt-1 font-display text-lg font-bold text-navy leading-snug">{title}</h3>
      <p className="mt-1 text-sm text-slate-600 leading-snug">{body}</p>
      <p className="mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-primary">
        {cta} <ArrowUpRight className="h-3.5 w-3.5" />
      </p>
      <div aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/10 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-[shimmer_1.5s_ease-in-out]" />
    </Link>
  );
}
