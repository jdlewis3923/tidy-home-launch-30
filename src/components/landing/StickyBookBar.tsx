import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Phone } from "lucide-react";
import { PHONE_TEL } from "@/lib/landing";
import { pushEvent } from "@/lib/tracking";
import { usePrimaryCta } from "@/hooks/usePrimaryCta";

interface Props {
  label: string;            // "House Cleaning · from $159/mo"
  /** Tracking surface, e.g. "lp_house-cleaning" */
  surface: string;
  /** Optional CTA overrides forwarded into /signup */
  service?: string;
  plan?: string;
  bundle?: string;
  services?: string;
}

/**
 * Slim sticky bar that appears once the user scrolls past the hero.
 * Desktop: top-anchored, slides down. Mobile: bottom-anchored, slides up,
 * 56px tall, safe-area inset aware, includes phone button.
 *
 * Routes through `usePrimaryCta` so the bar's main button works correctly
 * in both the post-launch (dashboard) and pre-launch (lead popup) modes.
 */
const StickyBookBar = ({ label, surface, service, plan, bundle, services }: Props) => {
  const [visible, setVisible] = useState(false);
  const { getCtaProps } = usePrimaryCta();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const desktopCta = getCtaProps({
    trackingId: `${surface}_sticky_top`,
    ctaText: "Book in 60 seconds",
    service,
    plan,
    bundle,
    services,
  });

  const mobileCta = getCtaProps({
    trackingId: `${surface}_sticky_mobile`,
    ctaText: "Book in 60 seconds",
    service,
    plan,
    bundle,
    services,
  });

  return (
    <>
      {/* Desktop: top-anchored */}
      <div
        className={`hidden md:flex fixed top-16 left-0 right-0 z-40 transition-all duration-200 ${
          visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
        aria-hidden={!visible}
      >
        <div className="w-full bg-navy/95 backdrop-blur-sm border-b border-primary-foreground/10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
            <span className="text-sm text-primary-foreground/90 font-medium truncate">{label}</span>
            <Link
              to={desktopCta.to}
              onClick={desktopCta.onClick}
              className="cta-arrow cta-press shrink-0 bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-4 py-1.5 rounded-md text-sm transition-colors"
            >
              Book in 60 seconds <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile: bottom-anchored, 56px + safe area */}
      <div
        className={`md:hidden fixed left-0 right-0 z-40 transition-all duration-200 ${
          visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-2 pointer-events-none"
        }`}
        style={{
          bottom: 0,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        aria-hidden={!visible}
      >
        <div className="bg-navy/95 backdrop-blur-sm border-t border-primary-foreground/10 shadow-lg">
          <div className="px-3 py-2 flex items-center gap-2" style={{ minHeight: 56 }}>
            <Link
              to={mobileCta.to}
              onClick={mobileCta.onClick}
              className="cta-arrow cta-press flex-1 text-center bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-4 py-3 rounded-lg text-sm"
            >
              Book in 60 seconds <span className="arrow">→</span>
            </Link>
            <a
              href={`tel:${PHONE_TEL}`}
              onClick={() => pushEvent("cta_click", { cta_id: `${surface}_sticky_mobile_call`, cta_text: "Call" })}
              aria-label="Call now"
              className="shrink-0 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg p-3 transition-colors"
            >
              <Phone className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

export default StickyBookBar;
