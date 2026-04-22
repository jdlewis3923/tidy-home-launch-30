import { Link } from "react-router-dom";
import TidyLogo from "@/components/TidyLogo";
import SparkleField from "./SparkleField";
import { SERVICE_AREA_TRUST } from "@/lib/landing";
import { usePrimaryCta } from "@/hooks/usePrimaryCta";
import { track } from "@/lib/track";

interface Props {
  headline: string;
  subhead?: string;
  ctaLabel: string;
  /** Tracking surface, e.g. "lp_house-cleaning_final" */
  trackingId: string;
  /** Optional CTA overrides — service/plan/bundle/services to forward into /signup. */
  service?: string;
  plan?: string;
  bundle?: string;
  services?: string;
}

/**
 * Rich navy final-CTA mirroring the homepage FinalCTA: bouncing logo,
 * sparkles, glowing gold pulsing button. Routes through `usePrimaryCta` so the
 * same button correctly takes users to the dashboard signup flow OR opens the
 * lead-capture popup based on the launch toggle.
 */
const LpFinalCta = ({
  headline,
  subhead,
  ctaLabel,
  trackingId,
  service,
  plan,
  bundle,
  services,
}: Props) => {
  const { getCtaProps } = usePrimaryCta();
  const ctaProps = getCtaProps({
    trackingId,
    ctaText: ctaLabel,
    service,
    plan,
    bundle,
    services,
  });

  // Map the trackingId surface to a service slug for the named conversion event.
  // trackingId looks like "lp_house-cleaning_final" or "bundle_final_cta".
  const reportedService = bundle
    ? "bundle"
    : trackingId.startsWith("lp_house-cleaning") ? "house-cleaning"
    : trackingId.startsWith("lp_lawn-care") ? "lawn-care"
    : trackingId.startsWith("lp_car-detailing") ? "car-detailing"
    : trackingId.startsWith("bundle") ? "bundle"
    : "site";

  const onClick = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    track("book_cta_click", {
      service: reportedService,
      plan,
      location: "final_banner",
    });
    ctaProps.onClick(e);
  };

  return (
    <section className="relative bg-gradient-to-b from-navy to-primary-deep py-24 px-4 overflow-hidden">
      <SparkleField />
      <div className="relative z-10 max-w-2xl mx-auto text-center flex flex-col items-center">
        <div className="animate-bounce-float mb-8">
          <TidyLogo size="lg" withBackground />
        </div>

        <h2 className="text-3xl md:text-5xl font-bold text-primary-foreground mb-4">
          {headline}
        </h2>
        {subhead && (
          <p className="text-primary-foreground/70 font-medium mb-2">{subhead}</p>
        )}
        <p className="text-primary-foreground/50 mb-8">No contracts. Cancel anytime.</p>

        <Link
          to={ctaProps.to}
          onClick={ctaProps.onClick}
          className="cta-arrow cta-press bg-gold hover:bg-gold/90 text-gold-foreground font-bold text-lg px-10 py-4 rounded-xl transition-all hover:scale-105 shadow-[0_0_24px_rgba(245,197,24,0.4)] hover:shadow-[0_0_36px_rgba(245,197,24,0.6)] animate-pulse-gold"
        >
          {ctaLabel} <span className="arrow">→</span>
        </Link>

        <p className="mt-6 text-xs text-primary-foreground/50">{SERVICE_AREA_TRUST}</p>
      </div>
    </section>
  );
};

export default LpFinalCta;
