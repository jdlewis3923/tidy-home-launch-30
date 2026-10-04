import { useEffect, useState } from "react";
import { RESERVATIONS_MODE, LAUNCH_DATE_LONG, FOUNDING_CAP } from "@/lib/launch";
import FoundingCounter from "@/components/FoundingCounter";
import heroVideo from "@/assets/homepage-mobile-hero-20261004b.mp4.asset.json";
import heroPoster from "@/assets/homepage-mobile-hero-poster-20261004b.jpg.asset.json";
import heroWideVideo from "@/assets/homepage-desktop-hero-20261004b.mp4.asset.json";
import heroWidePoster from "@/assets/homepage-desktop-hero-poster-20261004b.jpg.asset.json";
import { useLanguage } from "@/contexts/LanguageContext";
import { pushEvent } from "@/lib/tracking";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";

interface HeroProps {
  onOpenPopup: () => void;
}

const Hero = ({ onOpenPopup }: HeroProps) => {
  const { t } = useLanguage();
  // Reduced-motion visitors keep the still photo; everyone else gets the loop.
  const [motionOk, setMotionOk] = useState(false);
  useEffect(() => {
    setMotionOk(!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <section className="relative h-[88vh] md:h-auto md:min-h-[90vh] flex items-start md:items-center justify-center overflow-hidden">
      {/* Mobile (portrait source matches portrait viewport): animated loop. */}
      {motionOk ? (
        <video
          src={heroVideo.url}
          poster={heroPoster.url}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center md:hidden"
        />
      ) : (
        <img
          src={heroPoster.url}
          alt="Miami home at sunset"
          className="absolute inset-0 w-full h-full object-cover object-center md:hidden"
          width={1080}
          height={1920}
          fetchPriority="high"
          decoding="async"
        />
      )}
      {/* Desktop/laptop, including mobile browsers using Desktop site mode. */}
      {motionOk ? (
        <video
          src={heroWideVideo.url}
          poster={heroWidePoster.url}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-[center_55%] hidden md:block"
        />
      ) : (
        <img
          src={heroWidePoster.url}
          alt="Miami home opening onto a pool and palm-lined driveway at sunset"
          className="absolute inset-0 w-full h-full object-cover object-[center_55%] hidden md:block"
          width={1920}
          height={1080}
          fetchPriority="high"
          decoding="async"
        />
      )}

      <div className="absolute inset-0 bg-navy/45" />
      {/* Mobile scrims: keep the pill/headline and the launch lines readable over the video. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 md:hidden bg-[linear-gradient(to_bottom,rgba(0,30,60,0.55)_0%,rgba(0,30,60,0)_28%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 md:hidden bg-[linear-gradient(to_bottom,rgba(0,50,90,0)_55%,rgba(0,50,90,0.45)_100%)]"
      />




      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute top-20 left-[15%] animate-sparkle">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.4" />
          </svg>
        </div>
        <div className="absolute top-40 right-[20%] animate-sparkle" style={{ animationDelay: "1.5s" }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.3" />
          </svg>
        </div>
        <div className="absolute bottom-32 left-[25%] animate-sparkle" style={{ animationDelay: "3s" }}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.35" />
          </svg>
        </div>
        {/* Added stars for richer movement */}
        <div className="absolute top-16 right-[10%] animate-sparkle" style={{ animationDelay: "0.6s" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.32" />
          </svg>
        </div>
        <div
          className="absolute top-[28%] left-[45%] animate-sparkle"
          style={{ animationDelay: "2.2s", animationDuration: "3.4s" }}
        >
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
            <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.3" />
          </svg>
        </div>
        <div
          className="absolute top-[60%] left-[8%] animate-sparkle"
          style={{ animationDelay: "1.2s", animationDuration: "4.6s" }}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.28" />
          </svg>
        </div>
        <div className="absolute top-[55%] right-[6%] animate-sparkle" style={{ animationDelay: "3.4s" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.3" />
          </svg>
        </div>
        <div className="absolute bottom-20 right-[30%] animate-sparkle" style={{ animationDelay: "2.6s" }}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.34" />
          </svg>
        </div>
        <div
          className="absolute bottom-[42%] left-[55%] animate-sparkle"
          style={{ animationDelay: "0.4s", animationDuration: "3.6s" }}
        >
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
            <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.26" />
          </svg>
        </div>
      </div>

      <div className="relative z-10 flex h-full w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-center md:block md:h-auto md:gap-0 md:py-0">
        <div className="inline-flex items-center bg-primary/20 border border-primary/30 rounded-full px-3 py-1 md:px-4 md:py-1.5 md:mb-6">
          <span className="w-2 h-2 rounded-full bg-success mr-2 animate-pulse-dot" />
          <span className="text-[11px] md:text-xs font-medium text-primary-foreground">
            {t("Now accepting homes in Kendall & Pinecrest · Limited spots")}
          </span>
        </div>

        <div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-primary-foreground leading-tight mb-3 md:mb-6">
            {t("Your Home.")}
            <br />
            {t("On Autopilot.")}
          </h1>

          <p className="text-base md:text-xl font-medium tracking-tight text-primary-foreground drop-shadow-md max-w-2xl mx-auto mb-4 md:mb-8 leading-snug antialiased">
            {t("Pick your services. Set how often. Never think about it again.")}
          </p>
        </div>

        <div>
          <div className="flex flex-nowrap justify-center gap-1.5 md:gap-3 mb-5 md:mb-8">
            {/* Visitor-facing label is "Car Care"; "Shine Complete" stays as the product name on the pricing page. */}
            {["🏠 House Cleaning", "🌿 Lawn Care", "🚗 Car Care"].map((pill) => (
              <span
                key={pill}
                className="whitespace-nowrap bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-2.5 py-1 md:px-4 md:py-1.5 text-[11px] md:text-sm text-primary-foreground font-medium"
              >
                {t(pill)}
              </span>
            ))}
          </div>

          <button
            id="cta-hero"
            data-track="cta_hero"
            onClick={() => {
              pushEvent("cta_click", {
                cta_id: "hero",
                cta_text: CUSTOMER_DASHBOARD_ENABLED ? "See your price — 60 seconds" : "Request Early Access",
              });
              onOpenPopup();
            }}
            className="bg-gold hover:bg-gold/90 text-gold-foreground font-bold text-base md:text-lg px-6 md:px-8 py-3 md:py-4 rounded-xl transition-all hover:scale-105 shadow-[0_0_24px_rgba(245,197,24,0.4)] hover:shadow-[0_0_36px_rgba(245,197,24,0.6)] animate-pulse-gold"
          >
            {t(CUSTOMER_DASHBOARD_ENABLED ? "See your price — 60 seconds →" : "Request Early Access →")}
          </button>
        </div>

        <div className="w-full">
          <p className="mt-0 md:mt-4 text-xs text-primary-foreground/60" data-testid="hero-trust-line">
            {RESERVATIONS_MODE
              ? <>{t(`First visits begin ${LAUNCH_DATE_LONG}`)} · {FOUNDING_CAP} {t("founding homes")} · {t("No contracts")} ·{" "}</>
              : <>{t(CUSTOMER_DASHBOARD_ENABLED ? "No contracts · Cancel anytime ·" : "Founding memberships · No commitment ·")}{" "}</>}
            <strong className="font-bold text-primary-foreground">{t("48-hour guarantee")}</strong>
          </p>
          {RESERVATIONS_MODE && <div className="mt-2 md:mt-3"><FoundingCounter tone="dark" /></div>}
        </div>
      </div>
    </section>
  );
};

export default Hero;
