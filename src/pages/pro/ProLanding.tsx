/**
 * Pro Portal entry screen — /pro/welcome
 * An app entry screen, not a marketing page.
 */
import { Link } from "react-router-dom";
import ProHead from "@/components/pro/portal/ProHead";
import heroHome from "@/assets/miami-waterfront.webp";

export default function ProLanding() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--pro-navy))] font-sans">
      <ProHead title="Tidy Pro Portal" />

      <img
        src={heroHome}
        alt="South Florida home at golden hour"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--pro-navy)/0.25)] via-[hsl(var(--pro-navy)/0.65)] to-[hsl(var(--pro-navy))]" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-white">
        <div className="flex flex-col items-center">
          <img src="/pro-icon-512.png" alt="Tidy Pro" className="h-24 w-24 rounded-[24%] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)]" />
          <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.35em] text-[hsl(var(--pro-sky))]">
            Pro Portal
          </p>
        </div>

        <div className="mt-auto">
          <h1 className="text-[38px] font-extrabold leading-[1.05]">
            Do more on{" "}
            <span className="text-[hsl(var(--pro-sky))]">your terms</span>.
          </h1>
          <p className="mt-3 text-[16px] text-white/80">
            Your schedule. Your earnings. A cleaner community.
          </p>

          <Link
            to="/pro/login"
            className="mt-8 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[hsl(var(--pro-blue))] text-[16px] font-bold text-white active:scale-[0.98]"
          >
            Sign in
          </Link>
          <a
            href="mailto:hello@jointidy.co"
            className="mt-4 block min-h-[44px] py-2 text-center text-[14px] font-semibold text-white/80"
          >
            Need help? Contact support
          </a>

          <p className="mt-8 text-center text-[11px] font-bold uppercase tracking-[0.3em] text-white/45">
            Home · Lawn · Car
          </p>
        </div>
      </div>
    </div>
  );
}
