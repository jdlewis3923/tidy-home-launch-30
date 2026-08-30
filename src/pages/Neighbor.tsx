import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, MapPin, Lock, Gift, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead from "@/components/landing/SeoHead";
import Reveal from "@/components/landing/Reveal";
import LandingTicker from "@/components/landing/LandingTicker";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildSignupHref } from "@/lib/landing";
import { pushEvent } from "@/lib/tracking";
import { captureLandingSource, LANDING_SOURCES, type LandingSource } from "@/lib/landing-source";
import {
  FOUNDING_OFFER,
  SERVICE_AREA_LINE,
  ENTRY_PRICE_COPY,
  trustClaims,
} from "@/lib/pricing-canon";
import {
  serviceLabels,
  serviceUnits,
  formatSizePrice,
  type ServiceType,
} from "@/lib/dashboard-pricing";

const promiseIcons = [Lock, Gift, ShieldCheck, MapPin];

interface NeighborProps {
  /**
   * The door hanger is printed two-sided. `en` is /neighbor (English front),
   * `es` is /vecino (Spanish back) — same founding offer, Spanish interface set
   * on arrival so the reader never has to find the toggle.
   */
  variant?: "en" | "es";
}

/**
 * /neighbor and /vecino — the founding-neighbor landing page. It carries the
 * founding fulfilment promises (rate lock, free premium add-on, first visit
 * perfect or free, 25 homes per ZIP), forwards UTM/gclid params into signup,
 * and tags the signup with which side of the door hanger it came through.
 */
const Neighbor = ({ variant = "en" }: NeighborProps) => {
  const { t, setLanguage } = useLanguage();
  const { search } = useLocation();
  const landingSource: LandingSource =
    variant === "es" ? LANDING_SOURCES.vecino : LANDING_SOURCES.neighbor;
  const signupHref = buildSignupHref(search, { src: landingSource });

  useEffect(() => {
    if (variant === "es") setLanguage("es");
  }, [variant, setLanguage]);

  useEffect(() => {
    captureLandingSource(landingSource);
    pushEvent("doorhanger_landing", { landing_source: landingSource, variant });
  }, [landingSource, variant]);

  return (
    <div className="min-h-screen bg-background">
      {variant === "es" ? (
        <SeoHead
          title="Oferta de Vecino Fundador | Tidy Home Concierge"
          description="Los vecinos fundadores fijan su precio para siempre, reciben un servicio adicional gratis en la primera visita y una primera visita perfecta o es gratis. 25 hogares por código postal en Pinecrest, Kendall y Palmetto Bay."
          canonical="https://jointidy.co/vecino"
        />
      ) : (
        <SeoHead
          title="Founding Neighbor Offer | Tidy Home Concierge"
          description="Founding neighbors lock their rate for life, get a free premium add-on on visit one, and a first visit that is perfect or free. 25 homes per ZIP in Pinecrest, Kendall and Palmetto Bay."
          canonical="https://jointidy.co/neighbor"
        />
      )}
      <Navbar onOpenPopup={() => { window.location.assign(signupHref); }} />

      <main>
        <section className="bg-navy text-primary-foreground px-4 pt-28 pb-16">
          <div className="max-w-3xl mx-auto text-center">
            <Reveal>
              <span className="text-xs uppercase tracking-widest text-gold font-semibold">
                {t(FOUNDING_OFFER.headline)}
              </span>
              <h1 className="text-3xl md:text-5xl font-bold mt-4">
                {t("Be one of the first 25 homes on your street")}
              </h1>
              <p className="text-primary-foreground/80 mt-4 text-base md:text-lg">
                {t("One plan for cleaning, lawn care and car care — one flat price per visit, set by the size of your property.")}
              </p>
              <p className="text-sm text-primary-foreground/60 mt-3">
                {t(SERVICE_AREA_LINE)} · {t(ENTRY_PRICE_COPY)}
              </p>
              <Link
                to={signupHref}
                onClick={() => pushEvent("cta_click", { location: `${variant === "es" ? "vecino" : "neighbor"}_hero`, cta_text: "Claim founding spot", landing_source: landingSource })}
                className="btn-gold-glow inline-flex mt-8 items-center justify-center rounded-full px-8 py-4 text-base font-bold"
              >
                {t("Claim your founding spot")}
              </Link>
            </Reveal>
          </div>
        </section>

        <LandingTicker />

        <section className="px-4 py-16">
          <div className="max-w-3xl mx-auto">
            <Reveal>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center">
                {t("What a founding neighbor gets")}
              </h2>
              <p className="text-sm text-text-mid text-center mt-3">
                {t(FOUNDING_OFFER.inExchangeFor)}
              </p>
            </Reveal>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {FOUNDING_OFFER.promises.map((promise, i) => {
                const Icon = promiseIcons[i] ?? Check;
                return (
                  <Reveal key={promise} delay={i * 80}>
                    <li className="flex gap-3 rounded-xl border bg-card p-5 h-full">
                      <Icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="text-sm font-medium text-foreground">{t(promise)}</span>
                    </li>
                  </Reveal>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="bg-muted/40 px-4 py-16">
          <div className="max-w-3xl mx-auto text-center">
            <Reveal>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">{t("Where plans start")}</h2>
              <div className="mt-8 grid gap-4 md:grid-cols-3 text-left">
                {(["cleaning", "lawn", "detailing"] as ServiceType[]).map(service => (
                  <div key={service} className="rounded-xl border bg-card p-5">
                    <p className="text-sm font-semibold text-foreground">{t(serviceLabels[service])}</p>
                    <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">
                      {formatSizePrice(service, 1)}
                    </p>
                    <p className="text-xs text-text-mid mt-1">
                      {t(serviceUnits[service] === 'per_month' ? 'per month, size 1' : 'per visit, size 1')}
                    </p>
                  </div>
                ))}
              </div>
              <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2">
                {trustClaims().map(claim => (
                  <li key={claim} className="flex items-center gap-2 text-sm text-foreground/80">
                    <Check className="w-4 h-4 text-success flex-shrink-0" aria-hidden="true" />
                    {t(claim)}
                  </li>
                ))}
              </ul>
              <Link
                to={signupHref}
                onClick={() => pushEvent("cta_click", { location: `${variant === "es" ? "vecino" : "neighbor"}_footer`, cta_text: "Claim founding spot", landing_source: landingSource })}
                className="btn-gold-glow inline-flex mt-10 items-center justify-center rounded-full px-8 py-4 text-base font-bold"
              >
                {t("Claim your founding spot")}
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Neighbor;
