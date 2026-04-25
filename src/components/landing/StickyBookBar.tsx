import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Phone } from "lucide-react";
import { PHONE_TEL } from "@/lib/landing";
import { pushEvent } from "@/lib/tracking";
import { track } from "@/lib/track";
import { usePrimaryCta } from "@/hooks/usePrimaryCta";
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { t } = useLanguage();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Derive the service slug we report to GA. `bundle` LP passes "bundle" via surface.
  const reportedService = bundle ? "bundle" : (service ?? "site");

  const wrapBookCta = (origOnClick: (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void) =>
    (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
      track("book_cta_click", {
        service: reportedService,
        plan,
        location: "sticky_bar",
      });
      origOnClick(e);
    };

  const desktopRaw = getCtaProps({
    trackingId: `${surface}_sticky_top`,
    ctaText: "Book in 60 seconds",
    service,
    plan,
    bundle,
    services,
  });
  const desktopCta = { to: desktopRaw.to, onClick: wrapBookCta(desktopRaw.onClick) };

  const mobileRaw = getCtaProps({
    trackingId: `${surface}_sticky_mobile`,
    ctaText: "Book in 60 seconds",
    service,
    plan,
    bundle,
    services,
  });
  const mobileCta = { to: mobileRaw.to, onClick: wrapBookCta(mobileRaw.onClick) };

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
            <span className="text-sm text-primary-foreground/90 font-medium truncate">{t(label)}</span>
            <Link
              to={desktopCta.to}
              onClick={desktopCta.onClick}
              className="cta-arrow cta-press shrink-0 bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-4 py-1.5 rounded-md text-sm transition-colors"
            >
              {t("Book in 60 seconds")} <span className="arrow">→</span>
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
              onClick={() => {
                pushEvent("cta_click", { cta_id: `${surface}_sticky_mobile_call`, cta_text: "Call" });
                track("phone_click", { service: reportedService });
              }}
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
