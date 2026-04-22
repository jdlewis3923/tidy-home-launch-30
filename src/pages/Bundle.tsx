import { Link, useLocation } from "react-router-dom";
import { Check, MapPin } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FadeIn from "@/components/FadeIn";
import SeoHead from "@/components/landing/SeoHead";
import { SERVICE_AREA_TRUST, buildSignupHref } from "@/lib/landing";
import { pushEvent } from "@/lib/tracking";
import heroImg from "@/assets/hero-miami-home.jpg";

interface BundleTier {
  title: string;
  pct: string;
  body: string;
  cta: string;
  /** dashboard service slugs, comma separated */
  services?: string;
  custom?: boolean;
  highlighted?: boolean;
}

const tiers: BundleTier[] = [
  {
    title: "2-Service Bundle",
    pct: "10% off",
    body: "Pick any two: cleaning, lawn care, or detailing. We coordinate everything — you save 10% on the combined price every month.",
    cta: "Build my 2-service bundle →",
    services: "cleaning,lawn",
  },
  {
    title: "3-Service Bundle",
    pct: "20% off",
    body: "All three services on one plan: cleaning, lawn care, and detailing. Lock in 20% off the combined monthly price.",
    cta: "Build my 3-service bundle →",
    services: "cleaning,lawn,detailing",
    highlighted: true,
  },
  {
    title: "Custom",
    pct: "Tailored",
    body: "Larger home, oversized lot, or fleet of vehicles? We'll build a custom plan and send you a personal quote.",
    cta: "Request a custom plan →",
    custom: true,
  },
];

const Bundle = () => {
  const location = useLocation();

  const tierHref = (t: BundleTier) =>
    t.custom
      ? buildSignupHref(location.search, { custom: "true" })
      : buildSignupHref(location.search, { bundle: "true", services: t.services });

  const handleNavCta = () => {
    window.location.href = buildSignupHref(location.search);
  };

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
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <span className="text-xs uppercase tracking-widest text-gold font-semibold">Bundle &amp; Save</span>
          <h1 className="mt-3 text-3xl md:text-5xl lg:text-6xl font-extrabold text-primary-foreground leading-tight">
            Stack services. Save 10–20%.
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

      {/* TIERS */}
      <section className="bg-background py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {tiers.map((t, i) => (
              <FadeIn key={t.title} delay={i * 80}>
                <div
                  className={`bg-card border rounded-xl p-6 h-full flex flex-col hover-lift ${
                    t.highlighted ? "border-primary shadow-md ring-1 ring-primary/30" : ""
                  }`}
                >
                  {t.highlighted && (
                    <span className="self-start bg-gold text-gold-foreground text-xs font-semibold px-3 py-1 rounded-full mb-3">
                      Best Value
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-foreground">{t.title}</h3>
                  <div className="mt-2 text-3xl font-extrabold text-primary">{t.pct}</div>
                  <p className="text-sm text-text-mid mt-3 flex-1">{t.body}</p>
                  <Link
                    to={tierHref(t)}
                    onClick={() =>
                      pushEvent("cta_click", {
                        cta_id: `bundle_${t.title.toLowerCase().replace(/\s+/g, "_")}`,
                        cta_text: t.cta,
                      })
                    }
                    className="mt-5 block text-center bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                  >
                    {t.cta}
                  </Link>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* WHY BUNDLE */}
      <section className="bg-section-alt py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center">
            Why bundle?
          </h2>
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
        </div>
      </section>

      {/* GOOGLE GUARANTEED SLOT */}
      <section className="bg-background py-12 px-4">
        <div id="lsa-badge" className="max-w-3xl mx-auto" aria-label="Google Local Services badge slot" />
      </section>

      {/* FINAL CTA */}
      <section className="bg-gradient-to-b from-navy to-primary-deep py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground">
            Ready to bundle?
          </h2>
          <p className="text-primary-foreground/70 mt-3">
            60-second signup. Locked price. Cancel anytime.
          </p>
          <Link
            to={buildSignupHref(location.search, {
              bundle: "true",
              services: "cleaning,lawn,detailing",
            })}
            onClick={() =>
              pushEvent("cta_click", { cta_id: "bundle_final_cta", cta_text: "Start saving" })
            }
            className="mt-7 inline-block bg-gold hover:bg-gold/90 text-gold-foreground font-bold text-lg px-10 py-4 rounded-xl transition-all hover:scale-105 shadow-[0_0_24px_rgba(245,197,24,0.4)]"
          >
            Start saving →
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Bundle;
