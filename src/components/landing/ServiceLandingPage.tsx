import { Link } from "react-router-dom";
import { Check, Phone, MapPin, Sparkles, ShieldCheck, BadgeCheck, Camera } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead, { SeoService } from "@/components/landing/SeoHead";
import LandingFaq, { FaqItem } from "@/components/landing/LandingFaq";
import Reveal from "@/components/landing/Reveal";
import StickyBookBar from "@/components/landing/StickyBookBar";

import HowItWorksStrip from "@/components/landing/HowItWorksStrip";
import SavingsCallout from "@/components/landing/SavingsCallout";
import NeighborhoodTrust from "@/components/landing/NeighborhoodTrust";
import SparkleField from "@/components/landing/SparkleField";
import SectionDecor from "@/components/landing/SectionDecor";
import LandingTicker from "@/components/landing/LandingTicker";
import LpFinalCta from "@/components/landing/LpFinalCta";
import { PHONE_DISPLAY, PHONE_TEL, SERVICE_AREA_TRUST } from "@/lib/landing";
import { pushEvent, trackSelectPlan, useViewPricingObserver } from "@/lib/tracking";
import { track } from "@/lib/track";
import { PrimaryCtaProvider, usePrimaryCta } from "@/hooks/usePrimaryCta";
import { useLanguage } from "@/contexts/LanguageContext";

export interface PlanTier {
  name: string;
  price: string;
  cadence: string;
  description: string;
  planSlug: string;
  highlighted?: boolean;
  /**
   * When true the price is the entry (size-1) price and the card renders
   * "From $X" — required on every cadence-priced card so a size-2 homeowner is
   * never shown a number they don't actually owe.
   */
  isFromPrice?: boolean;
  /** Size qualifier shown under the price, e.g. "size 1 home — see sizes below". */
  sizeNote?: string;
  /** Numeric monthly price, used for select_plan / begin_checkout analytics. */
  priceValue?: number;
  /** Size this card is priced at, used for analytics. */
  size?: 1 | 2 | 3;
  /** Cadence for analytics; falls back to planSlug. */
  cadenceKey?: "monthly" | "biweekly" | "weekly";
}


export interface TrustCard {
  title: string;
  body: string;
}

export interface ServiceLandingConfig {
  serviceSlug: "house-cleaning" | "lawn-care" | "car-detailing";
  /** matches dashboard ServiceType, used for /signup?service= */
  signupServiceParam: "cleaning" | "lawn" | "detailing";
  eyebrow: string;
  h1: string;
  subhead: string;
  /** Optional intent-confirmation line shown directly under the subhead. */
  intentConfirm?: string;
  /** Optional system-bridge line: e.g. "Tidy isn't just cleaning — it's a system for your entire home." */
  systemBridge?: string;
  /** Optional CTA label override per page (e.g. "Book your cleaning"). */
  ctaPrimaryLabel?: string;
  /** Optional secondary plan-CTA label tying to the system (e.g. "Start your plan"). */
  ctaPlanLabel?: string;
  priceAnchor: string;
  /** Compact label for the sticky bar e.g. "House Cleaning · from $159/mo". */
  stickyLabel: string;
  /** Single line above the plans grid; wrap the price segment in **double asterisks**. */
  savingsCallout: string;
  heroImage: string;
  /** WebP variant of heroImage, emitted as the preferred <source>. */
  heroImageWebp?: string;
  /** Optional mobile-only hero image (used under 640px only). */
  heroImageMobile?: string;
  heroImageMobileWebp?: string;
  /** Intrinsic pixel size of heroImage — prevents layout shift. */
  heroDimensions?: [number, number];
  /** Intrinsic pixel size of heroImageMobile. */
  heroMobileDimensions?: [number, number];
  heroAlt: string;
  plans: PlanTier[];
  included: string[];
  /** Optional line listing paid add-ons, shown under the included list. */
  addOnsNote?: string;
  /**
   * Size-surcharge line. Per service — a cleaning page must never mention lawn
   * or vehicle surcharges.
   */
  surchargeNote?: string;
  trustCards: TrustCard[];
  faqs: FaqItem[];
  bundleCta: {
    title: string;
    body: string;
    /** Comma-separated dashboard service slugs to preselect on /signup */
    targetServices: string;
  };
  seo: {
    title: string;
    description: string;
    canonical: string;
    priceRange: string;
    /** Service + Offer JSON-LD carrying the three real size prices. */
    service?: SeoService;
  };

}

interface Props {
  config: ServiceLandingConfig;
}

/**
 * Outer wrapper — mounts the PrimaryCtaProvider so every CTA inside (hero,
 * plan cards, sticky bar, bundle cross-sell, final CTA, navbar) routes
 * through the same launch-toggle-aware handler.
 */
const ServiceLandingPage = ({ config }: Props) => (
  <PrimaryCtaProvider>
    <ServiceLandingPageInner config={config} />
  </PrimaryCtaProvider>
);

const ServiceLandingPageInner = ({ config }: Props) => {
  const { getCtaProps, openPopup, popupMode } = usePrimaryCta();
  const { t } = useLanguage();
  // Fires view_pricing once per pageview when the plan cards scroll into view.
  const pricingRef = useViewPricingObserver({ service: config.signupServiceParam });



  const ctaForPlan = (planSlug: string | undefined, where: string) => {
    const base = getCtaProps({
      trackingId: `lp_${config.serviceSlug}_${where}`,
      ctaText: "Book in about 2 minutes",
      service: config.signupServiceParam,
      plan: planSlug,
      trackingMeta: {
        service: config.signupServiceParam,
        plan: planSlug ?? "",
      },
    });

    // Normalize the surface to one of the 4 locations Google Ads cares about.
    const location: "hero" | "plans" | "sticky_bar" | "final_banner" = where.startsWith("plan_")
      ? "plans"
      : where === "final" || where === "final_banner"
        ? "final_banner"
        : where === "sticky_bar"
          ? "sticky_bar"
          : "hero";

    // Wrap the existing onClick so we ALSO emit the Google Ads conversion event.
    const onClick = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
      track("book_cta_click", {
        service: config.serviceSlug,
        plan: planSlug,
        location,
      });
      base.onClick(e);
    };
    return { to: base.to, onClick };
  };

  // Navbar's primary CTA slot — same target as the hero CTA.
  const handleNavCta = () => {
    pushEvent("cta_click", {
      cta_id: `lp_${config.serviceSlug}_nav`,
      cta_text: "Book in about 2 minutes",
      service: config.signupServiceParam,
    });
    track("book_cta_click", {
      service: config.serviceSlug,
      location: "hero",
    });
    if (popupMode) {
      openPopup();
    } else {
      window.location.href = ctaForPlan(undefined, "nav").to;
    }
  };

  const heroCta = ctaForPlan(undefined, "hero");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SeoHead
        {...config.seo}
        title={t(config.seo.title)}
        description={t(config.seo.description)}
        ogImage={config.heroImage}
        /* Built from the same array the FAQ section renders — cannot drift. */
        faqs={config.faqs.map((f) => ({ q: t(f.q), a: t(f.a) }))}
        breadcrumb={[
          { name: "Home", url: "https://jointidy.co/" },
          { name: t(config.eyebrow), url: config.seo.canonical },
        ]}
      />
      <Navbar onOpenPopup={handleNavCta} />
      <StickyBookBar
        label={t(config.stickyLabel)}
        surface={`lp_${config.serviceSlug}`}
        service={config.signupServiceParam}
      />

      {/* HERO */}
      <section className="relative min-h-[80vh] flex items-center pt-24 pb-16 overflow-hidden">
        {/*
          One <picture>: WebP first with a jpg fallback, the portrait mobile crop
          only under 640px (above that the 1600px landscape asset is sharper than
          upscaling a 900px portrait), intrinsic width/height to stop layout
          shift, and fetchpriority=high because this is the LCP element.
        */}
        <picture>
          {config.heroImageMobile && (
            <>
              {config.heroImageMobileWebp && (
                <source media="(max-width: 639px)" srcSet={config.heroImageMobileWebp} type="image/webp" />
              )}
              <source media="(max-width: 639px)" srcSet={config.heroImageMobile} type="image/jpeg" />
            </>
          )}
          {config.heroImageWebp && <source srcSet={config.heroImageWebp} type="image/webp" />}
          <img
            src={config.heroImage}
            alt={config.heroAlt}
            className="absolute inset-0 w-full h-full object-cover"
            width={config.heroDimensions?.[0] ?? 1600}
            height={config.heroDimensions?.[1] ?? 900}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </picture>

        <div className="absolute inset-0 bg-navy/65" />
        <SparkleField />

        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <span className="text-xs uppercase tracking-widest text-gold font-semibold">{t(config.eyebrow)}</span>
          <h1 className="mt-3 text-3xl md:text-5xl lg:text-6xl font-extrabold text-primary-foreground leading-tight">
            {t(config.h1)}
          </h1>
          <p className="mt-5 text-lg md:text-xl font-light text-primary-foreground/85 max-w-2xl mx-auto leading-relaxed">
            {t(config.subhead)}
          </p>
          {config.intentConfirm && (
            <p className="mt-3 text-base md:text-lg text-primary-foreground/80 max-w-2xl mx-auto">
              {t(config.intentConfirm)}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-1.5 text-primary-foreground font-medium">
              {t(config.priceAnchor)}
            </span>
            <span className="bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-1.5 text-primary-foreground font-medium inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {t(SERVICE_AREA_TRUST)}
            </span>
            <span className="bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-1.5 text-primary-foreground font-medium inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              {t("Background-Checked Pros")}
            </span>

          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <div className="flex flex-col items-center">
              <Link
                to={heroCta.to}
                onClick={heroCta.onClick}
                className="cta-arrow cta-press animate-pulse-gold bg-gold hover:bg-gold/90 text-gold-foreground font-bold text-lg px-8 py-4 rounded-xl transition-colors shadow-[0_0_24px_rgba(245,197,24,0.4)] hover:shadow-[0_0_36px_rgba(245,197,24,0.6)]"
              >
                {t(config.ctaPrimaryLabel ?? "Book in about 2 minutes")} <span className="arrow">→</span>
              </Link>
              <span className="mt-2 text-xs text-primary-foreground/70">
                {t("A quick form · No contracts")}
              </span>
            </div>
            <a
              href={`tel:${PHONE_TEL}`}
              onClick={() => {
                pushEvent("cta_click", { cta_id: `lp_${config.serviceSlug}_call_hero`, cta_text: "Call" });
                track("phone_click", { service: config.serviceSlug });
              }}
              className="inline-flex items-center gap-2 text-primary-foreground/90 hover:text-primary-foreground text-sm font-medium px-4 py-3"
            >
              <Phone className="w-4 h-4" />
              {PHONE_DISPLAY}
            </a>
          </div>

          <p className="mt-4 text-xs text-primary-foreground/60">
            {t("Locked price · No contracts · Cancel anytime · Pause or reschedule anytime")}
          </p>
        </div>
      </section>

      {/* SYSTEM BRIDGE — confirms intent then expands into Tidy's full-home system */}
      {config.systemBridge && (
        <section className="bg-section-alt border-y border-border/60 py-6 px-4">
          <p className="max-w-3xl mx-auto text-center text-sm md:text-base text-foreground/85 font-medium">
            {t(config.systemBridge)}
          </p>
        </section>
      )}

      {/* INFINITE TICKER (mirrors homepage energy) */}
      <LandingTicker />

      {/* PLANS */}
      <section className="relative bg-background py-20 px-4 overflow-hidden">
        <SectionDecor tone="primary" />
        <div className="relative max-w-5xl mx-auto">
          <Reveal className="text-center mb-6">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("Plans")}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">
              {t("Pick your cadence. Lock your price.")}
            </h2>
            <p className="mt-3 text-sm md:text-base text-text-mid max-w-xl mx-auto">
              {t("Set it once. We handle the rest — scheduling, reminders, the same crew every visit.")}
            </p>
            <p className="mt-2 text-xs text-text-light">{t("No contracts · Cancel, pause, or reschedule anytime")}</p>
          </Reveal>

          <SavingsCallout text={t(config.savingsCallout)} />

          <div
            ref={pricingRef}
            className={`grid gap-6 md:gap-5 items-stretch ${config.plans.length === 2 ? "md:grid-cols-2 md:max-w-3xl md:mx-auto" : "md:grid-cols-3"}`}
          >
            {config.plans.map((p, i) => {
              const planCta = ctaForPlan(p.planSlug, `plan_${p.planSlug}`);
              return (
                <Reveal key={`${p.planSlug}-${p.name}`} delay={i * 80}>
                  <div
                    className={`relative overflow-hidden bg-card border rounded-xl p-6 h-full flex flex-col hover-lift transition-transform ${
                      p.highlighted
                        ? "border-2 border-primary shadow-[0_0_28px_-8px_hsl(var(--primary)/0.3)] md:scale-[1.04] md:-my-1 z-10"
                        : ""
                    }`}
                  >
                    {p.highlighted && <span className="most-popular-ribbon">{t("Most Popular")}</span>}
                    <h3 className="text-lg font-bold text-foreground">{t(p.name)}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                      {/* Cadence-priced cards must say "From" — the number is the
                          size-1 price, not what every home pays. */}
                      {p.isFromPrice && <span className="text-sm font-semibold text-text-mid">{t("From")}</span>}
                      <span className="text-3xl font-extrabold text-foreground">{p.price}</span>
                      <span className="text-sm text-text-mid">{t(p.cadence)}</span>
                    </div>
                    {p.sizeNote && (
                      <p className="mt-1 text-[11px] leading-snug text-text-light">{t(p.sizeNote)}</p>
                    )}
                    <p className="text-sm text-text-mid mt-3 flex-1">{t(p.description)}</p>
                    <Link
                      to={planCta.to}
                      onClick={(e) => {
                        trackSelectPlan({
                          service: config.signupServiceParam,
                          cadence: p.cadenceKey ?? p.planSlug,
                          size: p.size,
                          price: p.priceValue,
                        });
                        planCta.onClick(e);
                      }}
                      className="cta-arrow cta-press mt-5 block text-center bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                    >
                      {t(config.ctaPlanLabel ?? "Choose")} {!config.ctaPlanLabel && t(p.name)}{" "}
                      <span className="arrow">→</span>
                    </Link>
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* Trust signal row directly under pricing — one claim per slot. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs md:text-sm text-text-mid">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-primary" />
              {t("Background-Checked Pros")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-primary" />
              {t("Photo-Verified Every Visit")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="w-4 h-4 text-gold" />
              {t("First visit perfect or it's free")}
            </span>
          </div>

        </div>
      </section>

      {/* INCLUDED */}
      <section className="bg-section-alt py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <Reveal className="text-center mb-10">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("What's Included")}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{t("Every visit, every time.")}</h2>
          </Reveal>

          <Reveal>
            <ul className="grid sm:grid-cols-2 gap-3 bg-card border rounded-xl p-6">
              {config.included.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground/85">
                  <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  {t(item)}
                </li>
              ))}
            </ul>
          </Reveal>

          {config.addOnsNote && (
            <p className="mt-4 text-xs text-text-light/90">{t(config.addOnsNote)}</p>
          )}

          {/* Per-service surcharge only — a cleaning page never mentions lawn
              or vehicle sizes. */}
          {config.surchargeNote && (
            <p className="mt-3 text-xs text-text-light/80">{t(config.surchargeNote)}</p>
          )}

        </div>
      </section>

      {/* HOW IT WORKS */}
      <HowItWorksStrip />

      {/* NEIGHBORHOOD TRUST */}
      <NeighborhoodTrust />

      {/* WHY TIDY / LOCAL TRUST */}
      <section className="relative bg-background py-20 px-4 overflow-hidden">
        <SectionDecor tone="gold" />
        <div className="relative max-w-5xl mx-auto">
          <Reveal className="text-center mb-10">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("Why Tidy")}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">
              {/* "Trusted" is unsupportable — we have zero customers. The ZIP
                  list is capped at 3 places per page, so use the area name. */}
              {t("Built for Kendall & Pinecrest")}
            </h2>

          </Reveal>

          {/* Mobile: snap-scroll carousel */}
          <div className="md:hidden snap-row flex overflow-x-auto gap-4 -mx-4 px-4 pb-2">
            {config.trustCards.map((card) => (
              <div key={card.title} className="bg-card border rounded-xl p-6 shrink-0" style={{ width: "85%" }}>
                <h3 className="text-sm font-semibold text-foreground mb-2">{t(card.title)}</h3>
                <p className="text-sm text-text-mid">{t(card.body)}</p>
              </div>
            ))}
          </div>

          {/* Desktop: 3-up grid with hover lift */}
          <div className="hidden md:grid md:grid-cols-3 gap-6">
            {config.trustCards.map((card, i) => (
              <Reveal key={card.title} delay={i * 80}>
                <div className="bg-card border rounded-xl p-6 h-full flex flex-col hover-lift">
                  <h3 className="text-sm font-semibold text-foreground mb-2">{t(card.title)}</h3>
                  <p className="text-sm text-text-mid flex-1">{t(card.body)}</p>
                </div>
              </Reveal>
            ))}
          </div>
          {/* The ZIP list intentionally stops here: hero chip, the
              service-area section above, and the footer are the only 3 places. */}

        </div>
      </section>

      {/* GOOGLE GUARANTEED SLOT */}
      <section className="bg-section-alt py-12 px-4">
        <div id="lsa-badge" className="max-w-3xl mx-auto" aria-label="Google Local Services badge slot" />
      </section>

      {/* FAQ */}
      <section className="relative bg-section-alt py-20 px-4 overflow-hidden">
        <SectionDecor tone="primary" />
        <div className="relative max-w-3xl mx-auto">
          <Reveal className="text-center mb-10">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("FAQ")}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{t("Questions, answered.")}</h2>
          </Reveal>
          <Reveal>
            <LandingFaq items={config.faqs.map((f) => ({ q: t(f.q), a: t(f.a) }))} />
          </Reveal>
        </div>
      </section>

      {/* BUNDLE CROSS-SELL */}
      <BundleCrossSell config={config} />

      {/* FINAL CTA — rich navy with bouncing logo + sparkles */}
      <LpFinalCta
        headline={t(`Ready to lock in your ${config.eyebrow.toLowerCase()}?`)}
        subhead={t("A quick form to sign up. Same crew. Locked price.")}
        ctaLabel={t("Start your plan")}
        trackingId={`lp_${config.serviceSlug}_final`}
        service={config.signupServiceParam}
      />

      <Footer />
    </div>
  );
};

const BundleCrossSell = ({ config }: Props) => {
  const { getCtaProps } = usePrimaryCta();
  const { t } = useLanguage();
  const cta = getCtaProps({
    trackingId: `lp_${config.serviceSlug}_bundle`,
    ctaText: "Bundle & save",
    bundle: "true",
    services: config.bundleCta.targetServices,
  });

  return (
    <section className="bg-background py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <Reveal>
          <div className="relative bg-gradient-to-r from-primary/10 to-success/10 border-2 border-primary/30 rounded-2xl p-6 md:p-8 text-center overflow-hidden">
            <div className="absolute top-3 right-3 save-badge-rotate bg-gold text-gold-foreground text-xs font-bold px-3 py-1 rounded-full shadow-sm">
              {t("Free monthly add-on")}
            </div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/15 mb-3">
              <Sparkles className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">{t(config.bundleCta.title)}</h3>
            <p className="text-sm text-text-mid mt-2">{t(config.bundleCta.body)}</p>
            <Link
              to={cta.to}
              onClick={(e) => {
                track("bundle_build_click", {
                  location: `lp_${config.serviceSlug}_bundle`,
                  service: "bundle",
                });
                cta.onClick(e);
              }}
              className="cta-arrow cta-press mt-5 inline-block bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-6 py-3 rounded-lg text-sm transition-colors"
            >
              {t("Bundle & save")} <span className="arrow">→</span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default ServiceLandingPage;
