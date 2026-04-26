import { Navigate, Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { CUSTOMER_ACCOUNT_ENABLED } from "@/lib/dashboard-config";
import tidyLogo from "@/assets/tidy-logo.png";

/**
 * /account — calm placeholder dashboard. Cream paper, oversized logo,
 * single "next visit" placeholder card. Full control-center build comes
 * in a follow-up pass.
 */
export default function Account() {
  if (!CUSTOMER_ACCOUNT_ENABLED) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(36_60%_94%)_0%,hsl(36_27%_96%)_55%,hsl(35_22%_92%)_100%)]" />
      </div>

      <div className="mx-auto max-w-2xl px-5 pt-10 pb-20">
        <div className="flex flex-col items-center text-center animate-calm-rise">
          <img
            src={tidyLogo}
            alt="Tidy"
            className="h-28 md:h-32 w-auto drop-shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          />
          <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.22em] text-ink-faint">
            your account
          </p>
          <h1 className="mt-2 text-4xl md:text-5xl font-bold text-ink lowercase tracking-tight" style={{ letterSpacing: "-0.025em" }}>
            your home, handled.
          </h1>
        </div>

        <div className="mt-10 space-y-4">
          <div className="rounded-2xl border border-hairline bg-white p-6 shadow-[0_8px_32px_-16px_hsl(var(--ink)/0.18)] animate-calm-rise" style={{ animationDelay: "120ms" }}>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">next visit</p>
            <p className="mt-3 text-2xl font-bold text-ink lowercase tracking-tight">scheduled</p>
            <p className="mt-1 text-sm text-ink-faint lowercase">we'll text you 24 hours before — same crew, every visit.</p>
          </div>

          <div className="rounded-2xl border border-hairline bg-white/70 p-6 backdrop-blur animate-calm-rise" style={{ animationDelay: "200ms" }}>
            <p className="text-sm text-ink-soft lowercase">
              calendar, service history, and billing are coming soon. for now you can manage your subscription through billing.
            </p>
            <Link
              to="/billing"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink lowercase underline-offset-4 hover:underline"
            >
              manage billing
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
