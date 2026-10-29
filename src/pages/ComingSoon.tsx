import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Home, Sprout, Car, ChevronRight, CalendarDays, Mail, ArrowRight, Globe, Sparkles } from "lucide-react";
import tidyLogo from "@/assets/tidy-official-logo.png";
import villa from "@/assets/coming-soon-villa.jpg";
import SparkleField from "@/components/landing/SparkleField";
import SeoHead from "@/components/landing/SeoHead";
import { useLanguage } from "@/contexts/LanguageContext";

// Nov 23, 2026, midnight Miami time (EST, UTC-5)
const LAUNCH = Date.parse("2026-11-23T00:00:00-05:00");

const Countdown = () => {
  const { t } = useLanguage();
  const reduce = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, LAUNCH - now);
  const parts = [
    { v: Math.floor(ms / 86400000), l: t("Days") },
    { v: Math.floor(ms / 3600000) % 24, l: t("Hours") },
    { v: Math.floor(ms / 60000) % 60, l: t("Minutes") },
    { v: Math.floor(ms / 1000) % 60, l: t("Seconds") },
  ];
  return (
    <div
      className="cs-glow-border relative mt-7 grid grid-cols-4 rounded-2xl border border-[#3b82f6]/70 bg-[#0b1530]/70 backdrop-blur-md"
      role="timer"
      aria-label={t("Countdown to November 23")}
    >
      {parts.map((p, i) => (
        <div key={i} className={`py-4 text-center ${i ? "border-l border-white/10" : ""}`}>
          <motion.div
            key={p.v}
            initial={reduce ? false : { y: -8, opacity: 0, filter: "blur(4px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.25 }}
            className="font-poppins text-3xl sm:text-5xl font-bold tabular-nums text-white"
          >
            {String(p.v).padStart(2, "0")}
          </motion.div>
          <div className="mt-1 text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/70">{p.l}</div>
        </div>
      ))}
    </div>
  );
};

const services = [
  { icon: Home, label: "Home Cleaning", tone: "border-[#3b82f6]/50", ic: "text-[#60a5fa]" },
  { icon: Sprout, label: "Lawn Care", tone: "border-[#34d399]/50", ic: "text-[#6ee7b7]" },
  { icon: Car, label: "Mobile Car Care", tone: "border-[#3b82f6]/50", ic: "text-[#60a5fa]" },
];

const ComingSoon = () => {
  const { t, language, setLanguage } = useLanguage();
  const reduce = useReducedMotion();
  const { pathname } = useLocation();
  const [email, setEmail] = useState("");
  const routeSeo: Record<string, { title: string; description: string }> = {
    "/bundle": { title: "Bundle Home Services | Tidy Miami", description: "Bundle cleaning, lawn care, and Car Care in Miami with one monthly Tidy plan." },
    "/help": { title: "Help Center | Tidy Home Concierge", description: "Answers about scheduling, billing, pausing and account access for Tidy Home Concierge members in Miami." },
    "/terms": { title: "Terms of Service | Tidy Home Concierge", description: "Terms for Tidy Home Concierge subscriptions, services, billing, and referrals in Miami." },
    "/privacy": { title: "Privacy Policy | Tidy Home Concierge", description: "How Tidy Home Concierge collects, uses, and protects customer information." },
  };
  const seo = routeSeo[pathname] ?? {
    title: "Tidy Home Concierge — Coming soon to Miami",
    description: "Tidy Home Concierge is a Miami subscription home-services company hiring our founding crew. Cleaning, lawn, Car Care. Opening soon.",
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent("Early access");
    const body = encodeURIComponent(`Please add ${email} to the Tidy launch list.`);
    window.location.href = `mailto:hello@jointidy.co?subject=${subject}&body=${body}`;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rise = (d: number): any =>
    reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: d, ease: [0.22, 1, 0.36, 1] } };

  return (
    <>
      <SeoHead title={t(seo.title)} description={t(seo.description)} canonical={`https://jointidy.co${pathname === "/" ? "" : pathname}`} noindex />
      <style>{`
        @keyframes csGlow { 0%,100% { box-shadow: 0 0 18px rgba(59,130,246,.35), inset 0 0 12px rgba(59,130,246,.12);} 50% { box-shadow: 0 0 38px rgba(59,130,246,.75), inset 0 0 22px rgba(59,130,246,.25);} }
        @keyframes csShine { 0% { background-position: -200% 0;} 100% { background-position: 200% 0;} }
        @keyframes csDrift { 0%,100% { transform: scale(1.06) translateY(0);} 50% { transform: scale(1.1) translateY(-10px);} }
        @keyframes csTwinkle { 0%,100% { opacity:.3; transform: scale(.8) rotate(0);} 50% { opacity:1; transform: scale(1.15) rotate(20deg);} }
        @keyframes csWave { 0%,100% { transform: translateX(0);} 50% { transform: translateX(-30px);} }
        .cs-glow-border { animation: csGlow 3s ease-in-out infinite; }
        .cs-shine { background: linear-gradient(90deg,#2563eb 0%,#60a5fa 40%,#bfdbfe 50%,#60a5fa 60%,#2563eb 100%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: csShine 4s linear infinite; }
        .cs-drift { animation: csDrift 18s ease-in-out infinite; }
        .cs-twinkle { animation: csTwinkle 2.2s ease-in-out infinite; }
        .cs-wave { animation: csWave 9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .cs-glow-border,.cs-shine,.cs-drift,.cs-twinkle,.cs-wave { animation: none !important; } }
      `}</style>

      <main className="relative min-h-screen overflow-hidden bg-[#0a1226] text-white font-poppins">
        {/* Photo background */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden">
          <img src={villa} alt="" width={1024} height={1536} className="cs-drift h-full w-full object-cover object-[70%_center] opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a1226] via-[#0a1226]/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a1226]/40 via-transparent to-[#0a1226]" />
        </div>
        <SparkleField />

        <div className="relative z-10 mx-auto max-w-4xl px-5 sm:px-10 pt-6 pb-10">
          {/* Header */}
          <div className="flex items-start justify-between">
            <motion.div {...rise(0)} className="relative">
              <img src={tidyLogo} alt="Tidy Home Concierge" className="h-20 sm:h-28 w-auto drop-shadow-[0_0_24px_rgba(37,99,235,0.55)]" />
              <Sparkles className="cs-twinkle absolute -right-2 -top-1 h-5 w-5 text-[#f5c518]" aria-hidden />
            </motion.div>
            <button
              type="button"
              onClick={() => setLanguage(language === "en" ? "es" : "en")}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#3b82f6]/60 bg-[#0b1530]/60 px-4 py-2 text-sm font-medium backdrop-blur transition hover:shadow-[0_0_20px_rgba(59,130,246,.6)]"
              aria-label={t("Change language")}
            >
              <Globe className="h-4 w-4" /> {language.toUpperCase()}
            </button>
          </div>

          <motion.div {...rise(0.1)} className="mt-10 border-l-2 border-[#3b82f6] pl-4 text-xs sm:text-sm uppercase tracking-[0.3em] text-white/85">
            {t("Launching soon in")} <span className="font-bold text-white">Miami</span>
          </motion.div>

          <motion.h1 {...rise(0.2)} className="mt-5 text-[3.2rem] leading-[0.95] sm:text-8xl font-bold tracking-tight">
            {t("We're almost")}
            <br />
            <span className="cs-shine drop-shadow-[0_0_20px_rgba(37,99,235,.5)]">{t("ready.")}</span>
          </motion.h1>

          <motion.p {...rise(0.3)} className="mt-6 max-w-lg text-base sm:text-xl font-light text-white/85">
            {t("Subscription home care in Kendall & Pinecrest — house cleaning, lawn care and mobile car care.")}{" "}
            <Link to="/apply" className="font-semibold text-[#3b82f6] hover:text-[#60a5fa]">
              {t("Hiring our founding crew now.")}
            </Link>
          </motion.p>

          <motion.div {...rise(0.4)}>
            <Countdown />
          </motion.div>

          <motion.p {...rise(0.5)} className="mt-6 flex items-center gap-3 text-sm sm:text-base text-white/90">
            <CalendarDays className="h-6 w-6 text-[#3b82f6]" />
            <span>
              {t("First visits begin")} <strong>{t("November 23")}</strong>
            </span>
          </motion.p>

          {/* Wave divider */}
          <svg className="cs-wave mt-8 h-12 w-[110%] -ml-[5%]" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden>
            <path d="M0 50 Q 400 -10 1000 50" fill="none" stroke="#2563eb" strokeWidth="3" style={{ filter: "drop-shadow(0 0 8px #3b82f6)" }} />
          </svg>

          {/* Services */}
          <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-5">
            {services.map((s, i) => (
              <motion.div
                key={s.label}
                {...rise(0.55 + i * 0.08)}
                whileHover={reduce ? undefined : { y: -4, scale: 1.03 }}
                whileTap={reduce ? undefined : { scale: 0.97 }}
              >
                <Link
                  to="/founding"
                  className={`group block rounded-2xl border ${s.tone} bg-[#0b1530]/70 p-3 sm:p-5 backdrop-blur transition hover:shadow-[0_0_28px_rgba(59,130,246,.5)]`}
                >
                  <div className="relative inline-block">
                    <s.icon className={`h-9 w-9 sm:h-12 sm:w-12 ${s.ic}`} strokeWidth={1.6} />
                    <Sparkles className="cs-twinkle absolute -right-3 -top-2 h-3.5 w-3.5 text-[#60a5fa]" style={{ animationDelay: `${i * 0.5}s` }} aria-hidden />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-1">
                    <span className="text-xs sm:text-base font-semibold leading-tight">{t(s.label)}</span>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1e3a8a]/60 transition group-hover:translate-x-0.5">
                      <ChevronRight className="h-3.5 w-3.5 text-[#60a5fa]" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Early access */}
          <motion.div {...rise(0.8)} className="mt-8 grid gap-5 rounded-3xl border border-[#3b82f6]/40 bg-[#0b1530]/80 p-6 sm:grid-cols-2 sm:items-center sm:p-8 backdrop-blur">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#60a5fa]">{t("Get early access")}</div>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold leading-tight">{t("Be the first to know when we launch.")}</h2>
            </div>
            <form onSubmit={submit}>
              <div className="flex items-center gap-3 rounded-full border border-white/25 bg-[#0a1226]/70 py-1.5 pl-5 pr-1.5 focus-within:border-[#3b82f6] focus-within:shadow-[0_0_20px_rgba(59,130,246,.45)] transition">
                <Mail className="h-5 w-5 text-white/70" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("Enter your email")}
                  aria-label={t("Enter your email")}
                  className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/60 outline-none"
                />
                <button type="submit" aria-label={t("Get early access")} className="cs-glow-border grid h-11 w-11 place-items-center rounded-full bg-[#2563eb] transition hover:scale-105 active:scale-95">
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-3 text-center text-xs text-[#93c5fd]">{t("Exclusive updates, early access and special offers.")}</p>
            </form>
          </motion.div>

          <div className="mt-10 flex items-center justify-center gap-4 text-sm text-white/75">
            <span className="h-px w-16 bg-white/25" />
            {t("Questions?")}
            <a className="font-semibold text-[#3b82f6] hover:underline" href="mailto:hello@jointidy.co">hello@jointidy.co</a>
            <span className="h-px w-16 bg-white/25" />
          </div>

          <div className="mt-8 text-center">
            <Link to="/admin/site-status" className="text-[10px] uppercase tracking-[0.2em] text-white/25 hover:text-white/60 transition-colors">
              Admin
            </Link>
          </div>
        </div>
      </main>
    </>
  );
};

export default ComingSoon;
