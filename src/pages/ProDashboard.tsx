/**
 * Pro Dashboard — /pro
 *
 * Light, welcoming contractor console. White canvas, navy ink, Tidy
 * blue accents, gold reserved for tier moments. Animated greeting,
 * brand presence via logo + soft gradient halo, hero stat strip, and
 * an interactive grid of route / payouts / photos / referrals cards.
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
import tidyLogo from "@/assets/tidy-logo.png";

export default function ProDashboard() {
  const [firstName, setFirstName] = useState("Pro");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) { setAuthed(false); return; }
      setAuthed(true);
      const meta = (user.user_metadata ?? {}) as Record<string, string>;
      const email = user.email ?? "";
      setFirstName(meta.first_name || email.split("@")[0] || "Pro");
    })();
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-navy">
      <Helmet><title>Pro Dashboard — Tidy</title></Helmet>

      {/* Soft brand atmosphere — Tidy blue + warm gold halos on white */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div
          className="absolute -top-48 -right-32 h-[640px] w-[640px] rounded-full opacity-50"
          style={{ background: "radial-gradient(circle, hsl(217 91% 60% / 0.18) 0%, transparent 65%)", filter: "blur(60px)" }}
        />
        <div
          className="absolute top-1/2 -left-40 h-[520px] w-[520px] rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, hsl(47 93% 53% / 0.18) 0%, transparent 65%)", filter: "blur(70px)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--navy)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--navy)) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at top, black 25%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse at top, black 25%, transparent 70%)",
          }}
        />
      </div>

      {/* Top bar */}
      <header className="relative z-10 border-b border-slate-200/70 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src={tidyLogo}
              alt="Tidy"
              className="h-12 w-auto drop-shadow-[0_4px_14px_rgba(37,99,235,0.18)] transition-transform group-hover:scale-105"
            />
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
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-navy">3</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero greeting */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 pt-10 pb-6 sm:px-8 animate-fade-in">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">{dateLabel}</p>
        <h1 className="mt-2 font-display text-4xl sm:text-6xl font-bold leading-[1.05] text-navy">
          {greeting},<br className="sm:hidden" />{" "}
          <span className="bg-gradient-to-r from-primary via-blue-500 to-primary-deep bg-clip-text text-transparent">
            {firstName}.
          </span>
        </h1>
        <p className="mt-3 max-w-xl text-base sm:text-lg text-slate-600">
          You're representing the #1 home-services brand in Miami. Here's your day.
        </p>

        {/* Hero stat strip */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat icon={<Calendar className="h-4 w-4" />} label="Today's visits" value="3" sub="Next 9:30 AM" />
          <HeroStat icon={<DollarSign className="h-4 w-4" />} label="Week to date" value="$640" sub="+18% vs last wk" accent />
          <HeroStat icon={<TrendingUp className="h-4 w-4" />} label="Rating (30d)" value="4.9" sub="★★★★★" />
          <HeroStat icon={<Zap className="h-4 w-4" />} label="Streak" value="12 days" sub="Don't break it" />
        </div>
      </section>

      {/* Tier widget */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-6 sm:px-8">
        <MyTierWidget />
      </section>

      {/* Module grid */}
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
          <ModuleCard
            featured
            icon={<MapPin className="h-5 w-5" />}
            kicker="Up next · 9:30 AM"
            title="2-bd condo · Coral Gables"
            body="Standard cleaning · 2hr · 1.4 mi away"
            cta="Open route"
            href="/pro"
          />
          <ModuleCard
            icon={<DollarSign className="h-5 w-5" />}
            kicker="Payouts"
            title="$640 this week"
            body="Next deposit Friday · Stripe Express"
            cta="View earnings"
            href="/pro"
          />
          <ModuleCard
            icon={<Camera className="h-5 w-5" />}
            kicker="Photo uploads"
            title="2 visits awaiting photos"
            body="Upload before midnight to stay 95%+ compliant"
            cta="Upload now"
            href="/pro"
            urgent
          />
          <ModuleCard
            icon={<Users className="h-5 w-5" />}
            kicker="Refer a Pro"
            title="Earn $150 per hire"
            body={`Your invite code: TIDY-${firstName.slice(0, 4).toUpperCase()}`}
            cta="Share invite"
            href="/pro"
          />
          <ModuleCard
            icon={<Sparkles className="h-5 w-5" />}
            kicker="Skills & badges"
            title="Unlock Detailing certification"
            body="Adds $20–$45 per add-on visit"
            cta="Start training"
            href="/pro"
          />
          <ModuleCard
            icon={<Clock className="h-5 w-5" />}
            kicker="Schedule"
            title="Set next-week availability"
            body="Lock in by Sunday 8 PM for priority routing"
            cta="Open calendar"
            href="/pro"
          />
        </div>
      </section>

      <footer className="relative z-10 border-t border-slate-200/70 py-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-8">
          <p className="text-xs text-slate-500">
            Tidy Home Concierge · Built for Pros, by Pros.
          </p>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            #1 in Miami
          </p>
        </div>
      </footer>
    </div>
  );
}

function HeroStat({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean;
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
    <Link
      to={href}
      className={`group relative overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-1 hover:shadow-xl ${
        featured
          ? "border-primary/30 bg-gradient-to-br from-blue-50 via-white to-white shadow-[0_8px_30px_-12px_rgba(37,99,235,0.35)]"
          : urgent
            ? "border-gold/40 bg-gradient-to-br from-amber-50 via-white to-white"
            : "border-slate-200 bg-white shadow-sm hover:border-primary/30"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${
          featured ? "bg-primary text-white" : urgent ? "bg-gold text-navy" : "bg-slate-100 text-navy"
        }`}>
          {icon}
        </div>
        <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-primary" />
      </div>
      <p className={`mt-4 text-[10px] font-bold uppercase tracking-[0.22em] ${urgent ? "text-amber-700" : "text-primary"}`}>{kicker}</p>
      <h3 className="mt-1 font-display text-lg font-bold text-navy leading-snug">{title}</h3>
      <p className="mt-1 text-sm text-slate-600 leading-snug">{body}</p>
      <p className="mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-primary">
        {cta} <ArrowUpRight className="h-3.5 w-3.5" />
      </p>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/10 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-[shimmer_1.5s_ease-in-out]"
      />
    </Link>
  );
}
