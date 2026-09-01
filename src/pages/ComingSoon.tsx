import { Link, useLocation } from "react-router-dom";
import tidyLogo from "@/assets/tidy-logo.png";
import SparkleField from "@/components/landing/SparkleField";
import SeoHead from "@/components/landing/SeoHead";
import { useLanguage } from "@/contexts/LanguageContext";

const ComingSoon = () => {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const routeSeo: Record<string, { title: string; description: string }> = {
    "/bundle": {
      title: "Bundle Home Services | Tidy Miami",
      description: "Bundle cleaning, lawn care, and car detailing in Miami with one monthly Tidy plan.",
    },
    "/help": {
      title: "Help Center | Tidy Home Concierge",
      description: "Answers about scheduling, billing, pausing and account access for Tidy Home Concierge members in Miami.",
    },
    "/terms": {
      title: "Terms of Service | Tidy Home Concierge",
      description: "Terms for Tidy Home Concierge subscriptions, services, billing, and referrals in Miami.",
    },
    "/privacy": {
      title: "Privacy Policy | Tidy Home Concierge",
      description: "How Tidy Home Concierge collects, uses, and protects customer information.",
    },
  };
  const seo = routeSeo[pathname] ?? {
    title: "Tidy Home Concierge — Coming soon to Miami",
    description: "Tidy Home Concierge is a Miami subscription home-services company hiring our founding crew. Cleaning, lawn, car detailing. Opening soon.",
  };
  return (
    <>
      <SeoHead
        title={t(seo.title)}
        description={t(seo.description)}
        canonical={`https://jointidy.co${pathname === "/" ? "" : pathname}`}
        noindex
      />

      <main className="relative min-h-screen overflow-hidden bg-cream text-ink">
        {/* Ambient brand glow — soft daylight wash */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#2563eb] opacity-[0.08] blur-[140px]" />
          <div className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full bg-[#f5c518] opacity-[0.16] blur-[160px]" />
          <div className="absolute bottom-[-200px] left-1/3 h-[420px] w-[420px] rounded-full bg-[#2563eb] opacity-[0.06] blur-[140px]" />
        </div>

        {/* Subtle grid texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(15,23,42,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Floating brand stars — navy ink on the light surface */}
        <SparkleField light />

        <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
          <img
            src={tidyLogo}
            alt="Tidy Home Concierge"
            className="h-28 sm:h-36 w-auto mb-8 drop-shadow-[0_10px_30px_rgba(15,23,42,0.15)]"
          />

          <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--gold))/45] bg-[hsl(var(--gold))/12] px-5 py-2 text-xs sm:text-sm font-semibold text-ink tracking-wide animate-pulse-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))] animate-pulse" />
            {t("Launching soon in Miami")}
          </span>

          <h1 className="font-poppins mt-6 text-4xl sm:text-6xl font-semibold tracking-tight text-ink">
            {t("We're almost ready.")}
          </h1>

          <p className="mt-4 max-w-xl text-base sm:text-lg font-light text-ink-soft">
            {t(
              "Subscription home care in Kendall & Pinecrest — house cleaning, lawn care, and mobile car detailing. Hiring our founding crew now.",
            )}
          </p>

          <div className="mt-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--gold))/45] bg-[hsl(var(--gold))/12] px-5 py-2 text-xs sm:text-sm font-semibold text-ink tracking-wide">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))]" />
              {t("Opening soon in Miami")}
            </span>
          </div>

          <div className="mt-12 text-xs sm:text-sm text-ink-faint">
            {t("Questions?")}{" "}
            <a className="text-ink-soft underline-offset-4 hover:underline" href="mailto:hello@jointidy.co">
              {t("hello@jointidy.co")}
            </a>
          </div>

          <div className="mt-16 text-[11px] uppercase tracking-[0.25em] text-ink-faint/70">
            {t("Tidy Home Concierge LLC · Miami, FL")}
          </div>

          <div className="mt-6">
            <Link
              to="/admin/site-status"
              className="text-[10px] uppercase tracking-[0.2em] text-ink-faint/60 hover:text-ink transition-colors"
            >
              Admin
            </Link>
          </div>

        </div>
      </main>
    </>
  );
};

export default ComingSoon;