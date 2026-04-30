import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import tidyLogo from "@/assets/tidy-logo.png";
import SparkleField from "@/components/landing/SparkleField";

// Launch target: June 1, 2026 at 9:00 AM Eastern Time (UTC-4 in June, EDT).
const LAUNCH_AT = new Date("2026-06-01T13:00:00Z").getTime();

function useCountdown(target: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { days, hours, minutes, seconds, done: diff === 0 };
}

const Cell = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-col items-center">
    <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 px-4 sm:px-6 py-4 sm:py-5 min-w-[78px] sm:min-w-[110px] shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
      <div className="font-poppins text-4xl sm:text-6xl font-semibold tabular-nums text-white tracking-tight">
        {String(value).padStart(2, "0")}
      </div>
    </div>
    <div className="mt-2 text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/60">
      {label}
    </div>
  </div>
);

const ComingSoon = () => {
  const { days, hours, minutes, seconds } = useCountdown(LAUNCH_AT);

  const launchLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date(LAUNCH_AT)),
    []
  );

  return (
    <>
      <Helmet>
        <title>Tidy — Launching June 1</title>
        <meta name="description" content="Tidy Home Services launches June 1. Miami's first home-care concierge — cleaning, lawn, and detailing handled." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <main className="relative min-h-screen overflow-hidden bg-[#0f172a] text-white">
        {/* Ambient brand glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#2563eb] opacity-20 blur-[140px]" />
          <div className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full bg-[#f5c518] opacity-10 blur-[160px]" />
          <div className="absolute bottom-[-200px] left-1/3 h-[420px] w-[420px] rounded-full bg-[#2563eb] opacity-10 blur-[140px]" />
        </div>

        {/* Subtle grid texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Floating brand stars */}
        <SparkleField />

        <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
          <img
            src={tidyLogo}
            alt="Tidy Home Services"
            className="h-28 sm:h-36 w-auto mb-8 drop-shadow-[0_10px_30px_rgba(37,99,235,0.35)]"
          />

          <span className="inline-flex items-center gap-2 rounded-full border border-[#f5c518]/40 bg-[#f5c518]/10 px-5 py-2 text-xs sm:text-sm font-semibold text-[#f5c518] tracking-wide animate-pulse-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f5c518] animate-pulse" />
            Launching soon in Miami
          </span>

          <h1 className="font-poppins mt-6 text-4xl sm:text-6xl font-semibold tracking-tight">
            We're almost ready.
          </h1>

          <p className="mt-4 max-w-xl text-base sm:text-lg font-light text-white/70">
            Tidy Home Services — one team handling cleaning, lawn, and detailing across Miami. Opening {launchLabel}.
          </p>

          <div className="mt-10 grid grid-cols-4 gap-3 sm:gap-5">
            <Cell value={days} label="Days" />
            <Cell value={hours} label="Hours" />
            <Cell value={minutes} label="Minutes" />
            <Cell value={seconds} label="Seconds" />
          </div>

          <div className="mt-12 text-xs sm:text-sm text-white/50">
            Questions? <a className="text-white/80 underline-offset-4 hover:underline" href="mailto:hello@jointidy.co">hello@jointidy.co</a>
          </div>

          <div className="mt-16 text-[11px] uppercase tracking-[0.25em] text-white/30">
            Tidy Home Services LLC · Miami, FL
          </div>

          <a
            href="/login"
            className="mt-6 text-[10px] uppercase tracking-[0.25em] text-white/20 hover:text-white/60 transition-colors"
            aria-label="Admin login"
          >
            Admin
          </a>
        </div>
      </main>
    </>
  );
};

export default ComingSoon;
