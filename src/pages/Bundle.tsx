import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, MapPin } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead from "@/components/landing/SeoHead";
import Reveal from "@/components/landing/Reveal";
import StickyBookBar from "@/components/landing/StickyBookBar";
import TrustSignalRow from "@/components/landing/TrustSignalRow";
import NeighborhoodTrust from "@/components/landing/NeighborhoodTrust";
import SparkleField from "@/components/landing/SparkleField";
import SectionDecor from "@/components/landing/SectionDecor";
import LandingTicker from "@/components/landing/LandingTicker";
import LpFinalCta from "@/components/landing/LpFinalCta";
import { SERVICE_AREA_TRUST } from "@/lib/landing";
import { pushEvent } from "@/lib/tracking";
import { track } from "@/lib/track";
import { PrimaryCtaProvider, usePrimaryCta } from "@/hooks/usePrimaryCta";
import heroImg from "@/assets/hero-miami-home.jpg";

type ServiceSlug = "cleaning" | "lawn" | "detailing";

const SERVICES: { slug: ServiceSlug; label: string; basePrice: number }[] = [
  { slug: "cleaning", label: "House Cleaning", basePrice: 159 },
  { slug: "lawn", label: "Lawn Care", basePrice: 85 },
  { slug: "detailing", label: "Car Detailing", basePrice: 159 },
];

const Bundle = () => (
  <PrimaryCtaProvider>
    <BundleInner />
  </PrimaryCtaProvider>
);

const BundleInner = () => {
  const [picked, setPicked] = useState<Set<ServiceSlug>>(new Set(["cleaning", "lawn"]));
  const { getCtaProps, openPopup, popupMode } = usePrimaryCta();

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
    const discounted = Math.round(subtotal * 0.9);
    return {
      valid,
      chosen,
      subtotal,
      discounted,
      services: chosen.map((c) => c.slug).join(","),
    };
  }, [picked]);

  const threeBundle = useMemo(() => {
    const subtotal = SERVICES.reduce((sum, s) => sum + s.basePrice, 0);
    const discounted = Math.round(subtotal * 0.8);
    return { subtotal, discounted };
  }, []);

  const handleNavCta = () => {
    pushEvent("cta_click", { cta_id: "bundle_nav", cta_text: "Book in 60 seconds" });
    track("book_cta_click", { service: "bundle", location: "hero" });
    if (popupMode) openPopup();
    else {
      window.location.href = getCtaProps({
        trackingId: "bundle_nav_redirect",
        ctaText: "Book in 60 seconds",
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
        title="Bundle & Save in Pinecrest + Kendall | Tidy Home Services"
        description="Stack home cleaning, lawn care, and car detailing on one plan. Save 10–20% in Pinecrest and Kendall (33156, 33183, 33186). One subscription, one crew, one bill."
        canonical="https://jointidy.co/bundle"
        ogImage={heroImg}
        priceRange="$85–$859"
      />
      <Navbar onOpenPopup={handleNavCta} />
      <StickyBookBar
        label="Bundle & Save · 10–20% off"
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
          <span className="text-xs uppercase tracking-widest text-gold font-semibold">Bundle &amp; Save</span>
          <h1 className="mt-3 text-3xl md:text-5xl lg:text-6xl font-extrabold text-primary-foreground leading-tight">
            Bundle &amp; Save — Stack services, save 10–20%
          </h1>
          <p className="mt-5 text-lg md:text-xl text-primary-foreground/85 max-w-2xl mx-auto leading-relaxed">
            The more you stack, the more you save. Pinecrest + Kendall only
            (33156 · 33183 · 33186).
          </p>
          <div className="mt-6 inline-flex items-center gap-1.5 bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-1.5 text-primary-foreground text-sm font-medium">
            <MapPin className="w-3.5 h-3.5" />
            {SERVICE_AREA_TRUST}
          </div>
        </div>
      </section>

      <LandingTicker />

      <TrustSignalRow />

      {/* TIERS */}
      <section className="relative bg-background py-20 px-4 overflow-hidden">
        <SectionDecor tone="primary" />
        <div className="relative max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {/* 2-Service — INTERACTIVE */}
            <Reveal>
              <div className="bg-card border rounded-xl p-6 h-full flex flex-col hover-lift">
                <h3 className="text-lg font-bold text-foreground">2-Service Bundle</h3>
                <div className="mt-2 text-3xl font-extrabold text-primary">10% off</div>
                <p className="text-sm text-text-mid mt-3">
                  Pick any two — we coordinate everything and you save 10% every month.
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
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 min-h-[44px]">
                  {twoBundle.valid ? (
                    <p className="text-sm text-text-mid">
                      <span className="line-through text-text-light mr-1">${twoBundle.subtotal}/mo</span>
                      <span className="font-bold text-foreground">${twoBundle.discounted}/mo</span>
                      <span className="text-text-light"> after 10% bundle discount</span>
                    </p>
                  ) : (
                    <p className="text-xs text-text-light italic">
                      Pick exactly 2 services to see your bundled price.
                    </p>
                  )}
                </div>

                {twoBundle.valid ? (
                  <Link
                    to={twoBundleCta.to}
                    onClick={(e) => {
                      track("bundle_build_click", { services: twoBundle.services });
                      track("book_cta_click", { service: "bundle", location: "plans" });
                      twoBundleCta.onClick(e);
                    }}
                    className="cta-arrow cta-press mt-auto block text-center bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                  >
                    Build my 2-service bundle <span className="arrow">→</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="mt-auto block w-full text-center bg-muted text-muted-foreground font-semibold px-5 py-3 rounded-lg text-sm cursor-not-allowed"
                  >
                    Pick 2 services to continue
                  </button>
                )}
              </div>
            </Reveal>

            {/* 3-Service — STATIC, HIGHLIGHTED */}
            <Reveal delay={80}>
              <div className="relative bg-card border-2 border-primary rounded-xl p-6 h-full flex flex-col hover-lift shadow-[0_0_28px_-8px_hsl(var(--primary)/0.3)] md:scale-[1.04] md:-my-1 z-10">
                <span className="most-popular-ribbon hidden md:inline-block">Best Value</span>
                <span className="md:hidden self-start bg-gold text-gold-foreground text-xs font-semibold px-3 py-1 rounded-full mb-3">
                  Best Value
                </span>
                <h3 className="text-lg font-bold text-foreground">3-Service Bundle</h3>
                <div className="mt-2 text-3xl font-extrabold text-primary">20% off</div>
                <p className="text-sm text-text-mid mt-3 flex-1">
                  All three services on one plan: cleaning, lawn care, and detailing.
                  Lock in 20% off the combined monthly price.
                </p>
                <p className="text-sm text-text-mid mt-3">
                  <span className="line-through text-text-light mr-1">${threeBundle.subtotal}/mo</span>
                  <span className="font-bold text-foreground">${threeBundle.discounted}/mo</span>
                </p>
                <Link
                  to={threeBundleCta.to}
                  onClick={(e) => {
                    track("book_cta_click", { service: "bundle", location: "plans" });
                    threeBundleCta.onClick(e);
                  }}
                  className="cta-arrow cta-press mt-5 block text-center bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                >
                  Build my 3-service bundle <span className="arrow">→</span>
                </Link>
              </div>
            </Reveal>

            {/* CUSTOM */}
            <Reveal delay={160}>
              <div className="bg-card border rounded-xl p-6 h-full flex flex-col hover-lift">
                <h3 className="text-lg font-bold text-foreground">Custom</h3>
                <div className="mt-2 text-3xl font-extrabold text-primary">Tailored</div>
                <p className="text-sm text-text-mid mt-3 flex-1">
                  Larger home, oversized lot, or fleet of vehicles? We'll build a custom
                  plan and send you a personal quote.
                </p>
                <Link
                  to={customCta.to}
                  onClick={customCta.onClick}
                  className="cta-arrow cta-press mt-5 block text-center bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                >
                  Request a custom plan <span className="arrow">→</span>
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
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Why bundle?
            </h2>
          </Reveal>
          <Reveal>
            <ul className="mt-8 grid sm:grid-cols-2 gap-3 bg-card border rounded-xl p-6">
              {[
                "10% off any 2 services — applied automatically",
                "20% off all 3 services — applied automatically",
                "One subscription, one bill, one crew",
                "Same locked price every month",
                "Cancel or adjust anytime",
                "Serving 33156 · 33183 · 33186 only",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-foreground/85">
                  <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  {line}
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
        headline="Ready to bundle?"
        subhead="60-second signup. Locked price. Cancel anytime."
        ctaLabel="Start saving"
        trackingId="bundle_final_cta"
        bundle="true"
        services="cleaning,lawn,detailing"
      />

      <Footer />
    </div>
  );
};

export default Bundle;
