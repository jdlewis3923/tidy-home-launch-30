import { Helmet } from "react-helmet-async";
import tidyLogo from "@/assets/tidy-logo.png";
import SparkleField from "@/components/landing/SparkleField";

const ComingSoon = () => {
  return (
    <>
      <Helmet>
        <title>Tidy Home Concierge — Coming soon to Miami</title>
        <meta
          name="description"
          content="Tidy Home Concierge is a Miami subscription home-services company hiring our founding crew. Cleaning, lawn, car detailing. Opening soon."
        />
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
            alt="Tidy Home Concierge"
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
            Subscription home care in Kendall &amp; Pinecrest — house cleaning, lawn care, and mobile car detailing. Hiring our founding crew now.
          </p>

          <div className="mt-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#f5c518]/40 bg-[#f5c518]/10 px-5 py-2 text-xs sm:text-sm font-semibold text-[#f5c518] tracking-wide">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f5c518]" />
              Opening soon in Miami
            </span>
          </div>

          <div className="mt-12 text-xs sm:text-sm text-white/50">
            Questions? <a className="text-white/80 underline-offset-4 hover:underline" href="mailto:hello@jointidy.co">hello@jointidy.co</a>
          </div>

          <div className="mt-16 text-[11px] uppercase tracking-[0.25em] text-white/30">
            Tidy Home Concierge LLC · Miami, FL
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
