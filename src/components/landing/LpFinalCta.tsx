import { Link } from "react-router-dom";
import TidyLogo from "@/components/TidyLogo";
import SparkleField from "./SparkleField";
import { SERVICE_AREA_TRUST } from "@/lib/landing";
import { pushEvent } from "@/lib/tracking";

interface Props {
  href: string;
  headline: string;
  subhead?: string;
  ctaLabel: string;
  /** Tracking surface, e.g. "lp_house-cleaning_final" */
  trackingId: string;
}

/**
 * Rich navy final-CTA mirroring the homepage FinalCTA: bouncing logo,
 * sparkles, glowing gold pulsing button. Replaces the flatter LP final
 * CTA so every landing page closes with the same energy as the homepage.
 */
const LpFinalCta = ({ href, headline, subhead, ctaLabel, trackingId }: Props) => (
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
        to={href}
        onClick={() =>
          pushEvent("cta_click", { cta_id: trackingId, cta_text: ctaLabel })
        }
        className="cta-arrow cta-press bg-gold hover:bg-gold/90 text-gold-foreground font-bold text-lg px-10 py-4 rounded-xl transition-all hover:scale-105 shadow-[0_0_24px_rgba(245,197,24,0.4)] hover:shadow-[0_0_36px_rgba(245,197,24,0.6)] animate-pulse-gold"
      >
        {ctaLabel} <span className="arrow">→</span>
      </Link>

      <p className="mt-6 text-xs text-primary-foreground/50">{SERVICE_AREA_TRUST}</p>
    </div>
  </section>
);

export default LpFinalCta;
