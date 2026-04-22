import { useLocation, Link } from "react-router-dom";
import { Check, Phone, MapPin, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead from "@/components/landing/SeoHead";
import LandingFaq, { FaqItem } from "@/components/landing/LandingFaq";
import Reveal from "@/components/landing/Reveal";
import StickyBookBar from "@/components/landing/StickyBookBar";
import TrustSignalRow from "@/components/landing/TrustSignalRow";
import HowItWorksStrip from "@/components/landing/HowItWorksStrip";
import SavingsCallout from "@/components/landing/SavingsCallout";
import NeighborhoodTrust from "@/components/landing/NeighborhoodTrust";
import {
  PHONE_DISPLAY,
  PHONE_TEL,
  SERVICE_AREA_TRUST,
  buildSignupHref,
} from "@/lib/landing";
import { pushEvent } from "@/lib/tracking";

export interface PlanTier {
  name: string;
  price: string;
  cadence: string;
  description: string;
  planSlug: string;
  highlighted?: boolean;
}

export interface Testimonial {
  quote: string;
  name: string;
  zip: string;
}

export interface ServiceLandingConfig {
  serviceSlug: "house-cleaning" | "lawn-care" | "car-detailing";
  /** matches dashboard ServiceType, used for /signup?service= */
  signupServiceParam: "cleaning" | "lawn" | "detailing";
  eyebrow: string;
  h1: string;
  subhead: string;
  priceAnchor: string;
  /** Compact label for the sticky bar e.g. "House Cleaning · from $159/mo". */
  stickyLabel: string;
  /** Single line above the plans grid; wrap the price segment in **double asterisks**. */
  savingsCallout: string;
  heroImage: string;
  heroAlt: string;
  plans: PlanTier[];
  included: string[];
  testimonials: Testimonial[];
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
  };
}

interface Props {
  config: ServiceLandingConfig;
}

const ServiceLandingPage = ({ config }: Props) => {
  const location = useLocation();

  const ctaHref = (planSlug?: string) =>
    buildSignupHref(location.search, {
      service: config.signupServiceParam,
      plan: planSlug,
    });

  const trackBook = (where: string, planSlug?: string) => {
    pushEvent("cta_click", {
      cta_id: `lp_${config.serviceSlug}_${where}`,
      cta_text: "Book in 60 seconds",
      service: config.signupServiceParam,
      plan: planSlug ?? "",
    });
    pushEvent("conversion_intent", {
      service: config.signupServiceParam,
      plan: planSlug ?? "",
      surface: `lp_${config.serviceSlug}`,
    });
  };

  const handleNavCta = () => {
    trackBook("nav");
    window.location.href = ctaHref();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SeoHead {...config.seo} ogImage={config.heroImage} />
      <Navbar onOpenPopup={handleNavCta} />
      <StickyBookBar
        label={config.stickyLabel}
        href={ctaHref()}
        surface={`lp_${config.serviceSlug}`}
      />

      {/* HERO */}
      <section className="relative min-h-[80vh] flex items-center pt-24 pb-16 overflow-hidden">
        <img
          src={config.heroImage}
          alt={config.heroAlt}
          className="absolute inset-0 w-full h-full object-cover"
          width={1600}
          height={896}
        />
        <div className="absolute inset-0 bg-navy/65" />

        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <span className="text-xs uppercase tracking-widest text-gold font-semibold">
            {config.eyebrow}
          </span>
          <h1 className="mt-3 text-3xl md:text-5xl lg:text-6xl font-extrabold text-primary-foreground leading-tight">
            {config.h1}
          </h1>
          <p className="mt-5 text-lg md:text-xl text-primary-foreground/85 max-w-2xl mx-auto leading-relaxed">
            {config.subhead}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-1.5 text-primary-foreground font-medium">
              {config.priceAnchor}
            </span>
            <span className="bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-1.5 text-primary-foreground font-medium inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {SERVICE_AREA_TRUST}
            </span>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={ctaHref()}
              onClick={() => trackBook("hero")}
              className="cta-arrow cta-press animate-pulse-once bg-gold hover:bg-gold/90 text-gold-foreground font-bold text-lg px-8 py-4 rounded-xl transition-colors shadow-lg"
            >
              Book in 60 seconds <span className="arrow">→</span>
            </Link>
            <a
              href={`tel:${PHONE_TEL}`}
              onClick={() => pushEvent("cta_click", { cta_id: `lp_${config.serviceSlug}_call_hero`, cta_text: "Call" })}
              className="inline-flex items-center gap-2 text-primary-foreground/90 hover:text-primary-foreground text-sm font-medium px-4 py-3"
            >
              <Phone className="w-4 h-4" />
              {PHONE_DISPLAY}
            </a>
          </div>

          <p className="mt-4 text-xs text-primary-foreground/60">
            Locked price · No contracts · Cancel anytime
          </p>
        </div>
      </section>

      {/* TRUST SIGNAL ROW */}
      <TrustSignalRow />

      {/* PLANS */}
      <section className="bg-background py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-6">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">Plans</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">
              Pick your cadence. Lock your price.
            </h2>
          </Reveal>

          <SavingsCallout text={config.savingsCallout} />

          <div className="grid md:grid-cols-3 gap-6 md:gap-5 items-stretch">
            {config.plans.map((p, i) => (
              <Reveal key={p.planSlug} delay={i * 80}>
                <div
                  className={`relative bg-card border rounded-xl p-6 h-full flex flex-col hover-lift transition-transform ${
                    p.highlighted
                      ? "border-2 border-primary shadow-[0_0_28px_-8px_hsl(var(--primary)/0.3)] md:scale-[1.04] md:-my-1 z-10"
                      : ""
                  }`}
                >
                  {p.highlighted && (
                    <span className="most-popular-ribbon hidden md:inline-block">
                      Most Popular
                    </span>
                  )}
                  {p.highlighted && (
                    <span className="md:hidden self-start bg-gold text-gold-foreground text-xs font-semibold px-3 py-1 rounded-full mb-3">
                      Most Popular
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-foreground">{p.price}</span>
                    <span className="text-sm text-text-mid">{p.cadence}</span>
                  </div>
                  <p className="text-sm text-text-mid mt-3 flex-1">{p.description}</p>
                  <Link
                    to={ctaHref(p.planSlug)}
                    onClick={() => trackBook(`plan_${p.planSlug}`, p.planSlug)}
                    className="cta-arrow cta-press mt-5 block text-center bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                  >
                    Choose {p.name} <span className="arrow">→</span>
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* INCLUDED */}
      <section className="bg-section-alt py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <Reveal className="text-center mb-10">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">What's Included</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">
              Every visit, every time.
            </h2>
          </Reveal>

          <Reveal>
            <ul className="grid sm:grid-cols-2 gap-3 bg-card border rounded-xl p-6">
              {config.included.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground/85">
                  <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <HowItWorksStrip />

      {/* NEIGHBORHOOD TRUST */}
      <NeighborhoodTrust />

      {/* LOCAL TRUST / TESTIMONIALS */}
      <section className="bg-background py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-10">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">Local Reviews</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">
              Trusted across {SERVICE_AREA_TRUST.replace("Serving ", "")}
            </h2>
          </Reveal>

          {/* Mobile: snap-scroll carousel */}
          <div className="md:hidden snap-row flex overflow-x-auto gap-4 -mx-4 px-4 pb-2">
            {config.testimonials.map((t) => (
              <div
                key={t.name + t.zip}
                className="bg-card border rounded-xl p-6 shrink-0"
                style={{ width: "85%" }}
              >
                <div className="text-gold text-sm mb-3">★★★★★</div>
                <p className="text-sm text-text-mid italic">"{t.quote}"</p>
                <div className="mt-4 pt-4 border-t border-border/60">
                  <p className="text-xs font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-text-light">ZIP {t.zip}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: 3-up grid with hover lift */}
          <div className="hidden md:grid md:grid-cols-3 gap-6">
            {config.testimonials.map((t, i) => (
              <Reveal key={t.name + t.zip} delay={i * 80}>
                <div className="bg-card border rounded-xl p-6 h-full flex flex-col hover-lift">
                  <div className="text-gold text-sm mb-3">★★★★★</div>
                  <p className="text-sm text-text-mid italic flex-1">"{t.quote}"</p>
                  <div className="mt-4 pt-4 border-t border-border/60">
                    <p className="text-xs font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-text-light">ZIP {t.zip}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <p className="text-center text-xs text-text-light mt-6">
            Placeholder reviews — verified customer reviews rolling out once we
            clear 50 jobs. {SERVICE_AREA_TRUST}.
          </p>
        </div>
      </section>

      {/* GOOGLE GUARANTEED SLOT */}
      <section className="bg-section-alt py-12 px-4">
        <div id="lsa-badge" className="max-w-3xl mx-auto" aria-label="Google Local Services badge slot" />
      </section>

      {/* FAQ */}
      <section className="bg-section-alt py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <Reveal className="text-center mb-10">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">Questions, answered.</h2>
          </Reveal>
          <Reveal>
            <LandingFaq items={config.faqs} />
          </Reveal>
        </div>
      </section>

      {/* BUNDLE CROSS-SELL */}
      <section className="bg-background py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <div className="relative bg-gradient-to-r from-primary/10 to-success/10 border-2 border-primary/30 rounded-2xl p-6 md:p-8 text-center overflow-hidden">
              <div className="absolute top-3 right-3 save-badge-rotate bg-gold text-gold-foreground text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                Save 10%
              </div>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/15 mb-3">
                <Sparkles className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="text-xl md:text-2xl font-bold text-foreground">
                {config.bundleCta.title}
              </h3>
              <p className="text-sm text-text-mid mt-2">{config.bundleCta.body}</p>
              <Link
                to={buildSignupHref(location.search, {
                  bundle: "true",
                  services: config.bundleCta.targetServices,
                })}
                onClick={() => pushEvent("cta_click", { cta_id: `lp_${config.serviceSlug}_bundle`, cta_text: "Bundle & save" })}
                className="cta-arrow cta-press mt-5 inline-block bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-6 py-3 rounded-lg text-sm transition-colors"
              >
                Bundle &amp; save <span className="arrow">→</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-gradient-to-b from-navy to-primary-deep py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground">
            Ready to lock in your {config.eyebrow.toLowerCase()}?
          </h2>
          <p className="text-primary-foreground/70 mt-3">
            60-second signup. Same crew. Locked price.
          </p>
          <Link
            to={ctaHref()}
            onClick={() => trackBook("final")}
            className="cta-arrow cta-press mt-7 inline-block bg-gold hover:bg-gold/90 text-gold-foreground font-bold text-lg px-10 py-4 rounded-xl transition-colors shadow-[0_0_24px_rgba(245,197,24,0.4)]"
          >
            Book in 60 seconds <span className="arrow">→</span>
          </Link>
          <p className="mt-4 text-xs text-primary-foreground/50">{SERVICE_AREA_TRUST}</p>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ServiceLandingPage;
