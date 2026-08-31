import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, MapPin } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead from "@/components/landing/SeoHead";
import Reveal from "@/components/landing/Reveal";
import StickyBookBar from "@/components/landing/StickyBookBar";

import NeighborhoodTrust from "@/components/landing/NeighborhoodTrust";
import SparkleField from "@/components/landing/SparkleField";
import SectionDecor from "@/components/landing/SectionDecor";
import LandingTicker from "@/components/landing/LandingTicker";
import LpFinalCta from "@/components/landing/LpFinalCta";
import { SERVICE_AREA_TRUST } from "@/lib/landing";
import { pushEvent } from "@/lib/tracking";
import { track } from "@/lib/track";
import { PrimaryCtaProvider, usePrimaryCta } from "@/hooks/usePrimaryCta";
import { useLanguage } from "@/contexts/LanguageContext";
import { BUNDLE_GIFT_COPY, SERVICE_NAMES, SIZE_PRICES, hasFreeAddonEntitlement } from "@/lib/pricing-canon";
import heroImg from "@/assets/hero-miami-home.jpg";

type ServiceSlug = "cleaning" | "lawn" | "detailing";

// Headline figures are size 1 for each service. Cleaning and lawn care are
// priced per visit; Shine Complete is a flat monthly price.
const SERVICES: { slug: ServiceSlug; label: string; basePrice: number }[] = [
  { slug: "cleaning", label: SERVICE_NAMES.cleaning, basePrice: SIZE_PRICES.cleaning[1] },
  { slug: "lawn", label: SERVICE_NAMES.lawn, basePrice: SIZE_PRICES.lawn[1] },
  { slug: "detailing", label: SERVICE_NAMES.detailing, basePrice: SIZE_PRICES.detailing[1] },
];

const Bundle = () => (
  <PrimaryCtaProvider>
    <BundleInner />
  </PrimaryCtaProvider>
);

const BundleInner = () => {
  const [picked, setPicked] = useState<Set<ServiceSlug>>(new Set(["cleaning", "lawn"]));
  const { getCtaProps, openPopup, popupMode } = usePrimaryCta();
  const { t } = useLanguage();

  const togglePick = (slug: ServiceSlug) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const twoBundle = useMemo(() => {
    const chosen = SERVICES.filter((s) => picked.has(s.slug));
    const valid = chosen.length === 2;
    const subtotal = chosen.reduce((sum, s) => sum + s.basePrice, 0);
    const earnsFreeAddon = hasFreeAddonEntitlement(2);
    return {
      valid,
      earnsFreeAddon,
      chosen,
      subtotal,
      services: chosen.map((c) => c.slug).join(","),
    };
  }, [picked]);

  const threeBundle = useMemo(() => {
    const subtotal = SERVICES.reduce((sum, s) => sum + s.basePrice, 0);
    return { subtotal, earnsFreeAddon: hasFreeAddonEntitlement(3) };
  }, []);

  const handleNavCta = () => {
    pushEvent("cta_click", { cta_id: "bundle_nav", cta_text: "Book in about 2 minutes" });
    track("book_cta_click", { service: "bundle", location: "hero" });
    if (popupMode) openPopup();
    else {
      window.location.href = getCtaProps({
        trackingId: "bundle_nav_redirect",
        ctaText: "Book in about 2 minutes",
      }).to;
    }
  };

  const twoBundleCta = getCtaProps({
    trackingId: "bundle_2_service",
    ctaText: "Build my 2-service bundle",
    bundle: "true",
    services: twoBundle.services,
    trackingMeta: { services: twoBundle.services },
  });

  const threeBundleCta = getCtaProps({
    trackingId: "bundle_3_service",
    ctaText: "Build my 3-service bundle",
    bundle: "true",
    services: "cleaning,lawn,detailing",
  });

  const customCta = getCtaProps({
    trackingId: "bundle_custom",
    ctaText: "Request a custom plan",
    custom: "true",
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SeoHead
        title={t("Bundle Your Services in Pinecrest + Kendall | Tidy Home Concierge")}
        description={t(
          "One flat price set by the size of your home, lawn or vehicle. Hold two or more services and you pick one free premium add-on every month — Pinecrest, Kendall and Palmetto Bay (33156, 33183, 33186).",
        )}
        canonical="https://jointidy.co/bundle"
        ogImage={heroImg}
        priceRange="$45–$279"
      />
      <Navbar onOpenPopup={handleNavCta} />
      <StickyBookBar
        label={t("Bundle your services · free monthly add-on")}
        surface="lp_bundle"
        bundle="true"
        services="cleaning,lawn,detailing"
      />

      {/* HERO */}
      <section className="relative min-h-[70vh] flex items-center pt-24 pb-16 overflow-hidden">
        <img
          src={heroImg}
          alt="Modern Miami home — bundle & save"
          className="absolute inset-0 w-full h-full object-cover"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-navy/70" />
        <SparkleField />
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <span className="text-xs uppercase tracking-widest text-gold font-semibold">{t("Bundle your services")}</span>
          <h1 className="mt-3 text-3xl md:text-5xl lg:text-6xl font-extrabold text-primary-foreground leading-tight">
            {t("Bundle your services — a free premium add-on every month")}
          </h1>
          <p className="mt-5 text-lg md:text-xl text-primary-foreground/85 max-w-2xl mx-auto leading-relaxed">
            {t("Hold two or more services and you pick one free premium add-on every month. Pinecrest, Kendall & Palmetto Bay only (33156 · 33183 · 33186).")}
          </p>
          <div className="mt-6 inline-flex items-center gap-1.5 bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-1.5 text-primary-foreground text-sm font-medium">
            <MapPin className="w-3.5 h-3.5" />
            {t(SERVICE_AREA_TRUST)}
          </div>
        </div>
      </section>

      <LandingTicker />

      {/* TIERS */}
      <section className="relative bg-background py-20 px-4 overflow-hidden">
        <SectionDecor tone="primary" />
        <div className="relative max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {/* 2-Service — INTERACTIVE */}
            <Reveal>
              <div className="bg-card border rounded-xl p-6 h-full flex flex-col hover-lift">
                <h3 className="text-lg font-bold text-foreground">{t("2-Service Bundle")}</h3>
                <div className="mt-2 text-3xl font-extrabold text-primary">{t("1 free premium add-on a month")}</div>
                <p className="text-sm text-text-mid mt-3">
                  {t(BUNDLE_GIFT_COPY.two)}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {SERVICES.map((s) => {
                    const active = picked.has(s.slug);
                    return (
                      <button
                        key={s.slug}
                        type="button"
                        onClick={() => togglePick(s.slug)}
                        aria-pressed={active}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-card text-text-mid border-border hover:border-primary/50 hover:text-foreground"
                        }`}
                      >
                        {active && <Check className="inline w-3 h-3 mr-1 -mt-0.5" />}
                        {t(s.label)}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 min-h-[44px]">
                  {twoBundle.valid ? (
                    <>
                      <p className="text-sm text-text-mid">
                        <span className="text-text-light mr-1">{t("from")}</span>
                        <span className="font-bold text-foreground">${twoBundle.subtotal}</span>
                        <span className="text-text-light">
                          {" "}
                          {t("plus one free premium add-on every month, your pick")}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-text-light">
                        {t(
                          "Size 1 prices. Your size is set by the size of your home, lawn or vehicle — cleaning and lawn care are priced per visit, so how often we come is up to you.",
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-text-light italic">
                      {t("Pick exactly 2 services to see your plan.")}
                    </p>
                  )}
                </div>


                {twoBundle.valid ? (
                  <Link
                    to={twoBundleCta.to}
                    onClick={(e) => {
                      track("bundle_build_click", {
                        location: "lp_bundle_2_service",
                        service: "bundle",
                        services: twoBundle.services,
                      });
                      track("book_cta_click", { service: "bundle", plan: "2-service", location: "plans" });
                      twoBundleCta.onClick(e);
                    }}
                    className="cta-arrow cta-press mt-auto block text-center bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                  >
                    {t("Build my 2-service bundle")} <span className="arrow">→</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="mt-auto block w-full text-center bg-muted text-muted-foreground font-semibold px-5 py-3 rounded-lg text-sm cursor-not-allowed"
                  >
                    {t("Pick 2 services to continue")}
                  </button>
                )}
              </div>
            </Reveal>

            {/* 3-Service — STATIC, HIGHLIGHTED */}
            <Reveal delay={80}>
              <div className="relative bg-card border-2 border-primary rounded-xl p-6 h-full flex flex-col hover-lift shadow-[0_0_28px_-8px_hsl(var(--primary)/0.3)] md:scale-[1.04] md:-my-1 z-10">
                <span className="most-popular-ribbon">{t("Best Value")}</span>
                <h3 className="text-lg font-bold text-foreground">{t("3-Service Bundle")}</h3>
                <div className="mt-2 text-3xl font-extrabold text-primary">{t("1 free premium add-on a month")}</div>
                <p className="text-sm text-text-mid mt-3 flex-1">
                  {t("Every service on one bill — and you still pick one free premium add-on every month.")}
                </p>
                <p className="text-sm text-text-mid mt-3">
                  <span className="text-text-light mr-1">{t("from")}</span>
                  <span className="font-bold text-foreground">${threeBundle.subtotal}</span>
                  <span className="text-text-light"> {t("plus one free premium add-on every month, your pick")}</span>
                </p>
                <p className="mt-1 text-xs text-text-light">
                  {t(
                    "Size 1 prices, one visit each for cleaning and lawn care. Your total changes with the visit frequency you choose.",
                  )}
                </p>

                <Link
                  to={threeBundleCta.to}
                  onClick={(e) => {
                    track("bundle_build_click", {
                      location: "lp_bundle_3_service",
                      service: "bundle",
                      services: "cleaning,lawn,detailing",
                    });
                    track("book_cta_click", { service: "bundle", plan: "3-service", location: "plans" });
                    threeBundleCta.onClick(e);
                  }}
                  className="cta-arrow cta-press mt-5 block text-center bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                >
                  {t("Build my 3-service bundle")} <span className="arrow">→</span>
                </Link>
              </div>
            </Reveal>

            {/* CUSTOM */}
            <Reveal delay={160}>
              <div className="bg-card border rounded-xl p-6 h-full flex flex-col hover-lift">
                <h3 className="text-lg font-bold text-foreground">{t("Custom")}</h3>
                <div className="mt-2 text-3xl font-extrabold text-primary">{t("Tailored")}</div>
                <p className="text-sm text-text-mid mt-3 flex-1">
                  {t(
                    "Larger home, oversized lawn, or a fleet of vehicles? We price it by hand and send you a personal quote.",
                  )}
                </p>
                <Link
                  to={customCta.to}
                  onClick={customCta.onClick}
                  className="cta-arrow cta-press mt-5 block text-center bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                >
                  {t("Request a custom plan")} <span className="arrow">→</span>
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* WHY BUNDLE */}
      <section className="relative bg-section-alt py-16 px-4 overflow-hidden">
        <SectionDecor tone="gold" />
        <div className="relative max-w-3xl mx-auto">
          <Reveal className="text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">{t("Why bundle?")}</h2>
          </Reveal>
          <Reveal>
            <ul className="mt-8 grid sm:grid-cols-2 gap-3 bg-card border rounded-xl p-6">
              {[
                "Two or more services — you pick 1 free premium add-on every month",
                "Your choice from the add-on list, applied automatically at checkout",
                "One subscription, one bill, one crew",
                "Same locked price every month",
                "Cancel or adjust anytime",
                "Serving 33156 · 33183 · 33186 only",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-foreground/85">
                  <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  {t(line)}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <NeighborhoodTrust />

      {/* GOOGLE GUARANTEED SLOT */}
      <section className="bg-background py-12 px-4">
        <div id="lsa-badge" className="max-w-3xl mx-auto" aria-label="Google Local Services badge slot" />
      </section>

      {/* FINAL CTA — rich navy with bouncing logo + sparkles */}
      <LpFinalCta
        headline={t("Ready to bundle?")}
        subhead={t("About 2 minutes to sign up. Locked price. Cancel anytime.")}
        ctaLabel={t("Build my plan")}
        trackingId="bundle_final_cta"
        bundle="true"
        services="cleaning,lawn,detailing"
      />

      <Footer />
    </div>
  );
};

export default Bundle;
