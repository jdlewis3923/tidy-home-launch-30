import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, MapPin, Lock, Gift, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead from "@/components/landing/SeoHead";
import Reveal from "@/components/landing/Reveal";
import LandingTicker from "@/components/landing/LandingTicker";
import FoundingConfetti from "@/components/landing/FoundingConfetti";
import TidyLogo from "@/components/TidyLogo";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { buildSignupHref } from "@/lib/landing";
import { OFFER_SEEN_PARAM, OFFER_SEEN_VALUE, markFoundingOfferShown } from "@/lib/doorhanger";
import { pushEvent } from "@/lib/tracking";
import { captureLandingSource, LANDING_SOURCES, type LandingSource } from "@/lib/landing-source";
import { neighborhoodForZip, printedZip, FOUNDING_CAP } from "@/lib/neighborhoods";
import { FOUNDING_OFFER, ENTRY_PRICE_COPY } from "@/lib/pricing-canon";
import {
  serviceLabels,
  serviceUnits,
  getSizePrice,
  type ServiceType,
} from "@/lib/dashboard-pricing";

import heroJpg from "@/assets/hero-miami-home.jpg";
import heroWebp from "@/assets/hero-miami-home.webp";
import heroMobileJpg from "@/assets/hero-miami-home-mobile.jpg";
import heroMobileWebp from "@/assets/hero-miami-home-mobile.webp";
import cleaningJpg from "@/assets/cleaning-interior.jpg";
import cleaningWebp from "@/assets/cleaning-interior.webp";
import lawnJpg from "@/assets/lawn-care.jpg";
import lawnWebp from "@/assets/lawn-care.webp";
import carJpg from "@/assets/car-detailing.jpg";
import carWebp from "@/assets/car-detailing.webp";

const promiseIcons = [Lock, Gift, ShieldCheck, MapPin];

const SERVICE_CARDS: {
  service: ServiceType;
  jpg: string;
  webp: string;
  includes: string;
}[] = [
  {
    service: "cleaning",
    jpg: cleaningJpg,
    webp: cleaningWebp,
    includes: "Kitchen, baths, floors and dusting, same crew every visit.",
  },
  {
    service: "lawn",
    jpg: lawnJpg,
    webp: lawnWebp,
    includes: "Mow, edge, trim and blow down — clippings hauled off.",
  },
  {
    service: "detailing",
    jpg: carJpg,
    webp: carWebp,
    includes: "Hand wash, wheels, glass and interior wipe-down in your driveway.",
  },
];

/**
 * /neighbor — the door-hanger QR landing page. Mobile-first: it is read on a
 * doorstep in Miami daylight, so the hero is a full-bleed photograph with a
 * hard scrim, the type is large and heavy, and gold is reserved for the single
 * primary CTA and the live scarcity count.
 *
 * The founding perks are UNCONDITIONAL. No review is requested or implied
 * anywhere on this page — paying for reviews violates Google's policy.
 *
 * All attribution params (lang, zip, src, placement, utm_*, gclid) are captured
 * and forwarded into the existing checkout path untouched.
 */
const Neighbor = () => {
  const { t, language, setLanguage } = useLanguage();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const langParam = params.get("lang");
  const zipParam = printedZip(params.get("zip"));
  const neighborhood = neighborhoodForZip(zipParam);
  // hero = scanned off the door, card = kept the tear-off and scanned later.
  const placement = params.get("placement") ?? undefined;
  // The Spanish panel's QR code carries ?lang=es — that is the panel split.
  const landingSource: LandingSource =
    langParam === "es" ? LANDING_SOURCES.es : LANDING_SOURCES.en;
  // offer=seen releases the /dashboard/plan door-hanger redirect. All existing
  // attribution params (src, zip, lang, placement, utm_*, gclid) ride along.
  const signupHref = buildSignupHref(search, {
    src: landingSource,
    [OFFER_SEEN_PARAM]: OFFER_SEEN_VALUE,
  });
  const isSpanish = language === "es";
  const [spotsLeft, setSpotsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (langParam === "es") setLanguage("es");
    else if (langParam === "en") setLanguage("en");
  }, [langParam, setLanguage]);

  useEffect(() => {
    captureLandingSource(landingSource);
    markFoundingOfferShown();
    pushEvent("doorhanger_landing", { landing_source: landingSource, placement: placement ?? "direct" });
  }, [landingSource, placement]);

  // Live remaining-spot count, read from the database per printed ZIP. If the
  // read fails we render the cap alone — never a fabricated number.
  useEffect(() => {
    if (!zipParam) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("founding_spots_left", { _zip: zipParam });
      if (!cancelled && !error && typeof data === "number") setSpotsLeft(data);
    })();
    return () => { cancelled = true; };
  }, [zipParam]);

  const heroHeadline = neighborhood
    ? `${t("Be one of the first 25 homes in")} ${neighborhood}.`
    : t("Be one of the first 25 homes on your street");

  const scarcityLine =
    spotsLeft !== null && zipParam
      ? `${spotsLeft} ${t("of")} ${FOUNDING_CAP} ${t("founding spots left in")} ${zipParam}`
      : t("Capped at 25 founding homes per ZIP");

  const ctaClick = (location: string) =>
    pushEvent("cta_click", {
      location,
      cta_text: "Claim founding spot",
      landing_source: landingSource,
      placement: placement ?? "direct",
    });

  return (
    <div className="min-h-screen bg-white">
      {isSpanish ? (
        <SeoHead
          title="Oferta de Vecino Fundador | Tidy Home Concierge"
          description="Los vecinos fundadores fijan su precio para siempre y reciben un servicio adicional gratis en la primera visita. 25 hogares por código postal en Pinecrest y Kendall."
          canonical="https://jointidy.co/neighbor"
        />
      ) : (
        <SeoHead
          title="Founding Neighbor Offer | Tidy Home Concierge"
          description="Founding neighbors lock their rate for life and get a free premium add-on on visit one. 25 homes per ZIP in Pinecrest and Kendall."
          canonical="https://jointidy.co/neighbor"
        />
      )}
      <FoundingConfetti />
      <Navbar onOpenPopup={() => { window.location.assign(signupHref); }} />

      <main>
        {/* ── HERO: full-bleed photograph ───────────────────────────────── */}
        <section className="relative isolate min-h-[86svh] flex flex-col justify-end overflow-hidden">
          <picture>
            <source media="(max-width: 767px)" srcSet={heroMobileWebp} type="image/webp" />
            <source media="(max-width: 767px)" srcSet={heroMobileJpg} type="image/jpeg" />
            <source srcSet={heroWebp} type="image/webp" />
            <img
              src={heroJpg}
              alt="A Miami home in Pinecrest kept by Tidy"
              width={1920}
              height={1280}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 -z-10 h-full w-full object-cover object-center"
            />
          </picture>
          {/* Hard scrim — daylight legibility, not decoration. */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0F1729] via-[#0F1729]/80 to-[#0F1729]/25" />

          <div className="absolute left-4 top-24 md:left-8">
            <TidyLogo size="sm" priority />
          </div>

          <div className="px-5 pb-10 pt-40 md:px-8 md:pb-16">
            <div className="mx-auto w-full max-w-3xl">
              <span className="inline-flex rounded-full bg-[#F7C618] px-3 py-1 text-[13px] font-extrabold uppercase tracking-wide text-[#0F1729]">
                {t(FOUNDING_OFFER.headline)}
              </span>
              <h1 className="mt-4 text-[2.35rem] leading-[1.06] font-extrabold text-white md:text-6xl">
                {heroHeadline}
              </h1>
              <p className="mt-4 text-[17px] font-semibold leading-snug text-white md:text-xl">
                {t("Cleaning, lawn and car care on one plan. One flat price per visit.")}
              </p>
              <Link
                to={signupHref}
                onClick={() => ctaClick("neighbor_hero")}
                className="mt-7 flex w-full items-center justify-center rounded-full bg-[#F7C618] px-8 py-4 text-lg font-extrabold text-[#0F1729] shadow-lg shadow-black/30 active:scale-[0.99] md:w-auto md:inline-flex"
              >
                {t("Claim your founding spot")}
              </Link>
              <p className="mt-3 text-[15px] font-medium text-white/85">
                {t(ENTRY_PRICE_COPY)} · {t("No contract. Cancel anytime.")}
              </p>
            </div>
          </div>
        </section>

        {/* ── SCARCITY BAND: the visual anchor, with a moving banner ─────── */}
        <section className="bg-[#0F1729] py-7">
          <div className="mx-auto max-w-3xl px-5 text-center">
            <p className="text-[26px] font-extrabold leading-tight text-[#F7C618] md:text-4xl">
              {scarcityLine}
            </p>
            <p className="mt-2 text-[15px] font-medium text-white/75">
              {t("Founding spots are limited to 25 homes per ZIP and do not reopen.")}
            </p>
          </div>
          <div className="mt-5 overflow-hidden border-y border-white/10 py-2">
            <div className="flex w-max animate-[marquee_22s_linear_infinite] gap-10 whitespace-nowrap will-change-transform">
              {[0, 1].map(dup => (
                <div key={dup} className="flex gap-10" aria-hidden={dup === 1}>
                  {[
                    t("Locked founding rate"),
                    t("One free premium add-on"),
                    t("First visit perfect or it’s free"),
                    t("Same crew every visit"),
                  ].map(item => (
                    <span key={item} className="text-[15px] font-bold uppercase tracking-wide text-white/80">
                      {item}
                      <span className="ml-10 text-[#F7C618]">◆</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── THE THREE SERVICES ────────────────────────────────────────── */}
        <section className="bg-white px-5 pt-14 pb-6 md:px-8 md:pt-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-[26px] font-extrabold leading-tight text-[#0F1729] md:text-4xl">
              {t("Three services. One plan.")}
            </h2>
            <div className="mt-7 -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
              {SERVICE_CARDS.map(card => (
                <article
                  key={card.service}
                  className="w-[80%] flex-shrink-0 snap-center overflow-hidden rounded-2xl border border-[#0F1729]/10 bg-white shadow-sm md:w-auto"
                >
                  <picture>
                    <source srcSet={card.webp} type="image/webp" />
                    <img
                      src={card.jpg}
                      alt={t(serviceLabels[card.service])}
                      width={800}
                      height={533}
                      loading="lazy"
                      decoding="async"
                      className="h-44 w-full object-cover"
                    />
                  </picture>
                  <div className="p-5">
                    <h3 className="text-lg font-extrabold text-[#0F1729]">
                      {t(serviceLabels[card.service])}
                    </h3>
                    <p className="mt-1 text-2xl font-extrabold tabular-nums text-[#0F1729]">
                      {`$${getSizePrice(card.service, 1)}`}
                      <span className="ml-2 text-[15px] font-semibold text-[#0F1729]/60">
                        {t(serviceUnits[card.service] === "per_month" ? "per month, size 1" : "per visit, size 1")}
                      </span>
                    </p>
                    <p className="mt-3 text-[17px] leading-snug text-[#0F1729]/75">
                      {t(card.includes)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── TRUST STRIP: rendered exactly once ────────────────────────── */}
        <LandingTicker single />

        {/* ── WHAT A FOUNDING NEIGHBOR GETS ─────────────────────────────── */}
        <section className="bg-[#F7F8FA] px-5 py-16 md:px-8 md:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-[26px] font-extrabold leading-tight text-[#0F1729] md:text-4xl">
              {t("What a founding neighbor gets")}
            </h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {FOUNDING_OFFER.promises.map((promise, i) => {
                const Icon = promiseIcons[i] ?? Check;
                return (
                  <Reveal key={promise} delay={i * 70}>
                    <li className="flex h-full gap-3 rounded-2xl border border-[#0F1729]/10 bg-white p-5">
                      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#2563EB]" aria-hidden="true" />
                      <span className="text-[17px] font-semibold leading-snug text-[#0F1729]">
                        {t(promise)}
                      </span>
                    </li>
                  </Reveal>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ── CLOSING CTA ───────────────────────────────────────────────── */}
        <section className="bg-white px-5 py-16 text-center md:px-8 md:py-20">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-[28px] font-extrabold leading-tight text-[#0F1729] md:text-4xl">
              {neighborhood
                ? `${t("Claim your spot in")} ${neighborhood}.`
                : t("Claim your founding spot")}
            </h2>
            <p className="mt-3 text-[17px] text-[#0F1729]/70">
              {t("Takes about two minutes. No contract.")}
            </p>
            <Link
              to={signupHref}
              onClick={() => ctaClick("neighbor_footer")}
              className="mt-7 flex w-full items-center justify-center rounded-full bg-[#F7C618] px-8 py-4 text-lg font-extrabold text-[#0F1729] shadow-lg shadow-black/10 active:scale-[0.99] md:w-auto md:inline-flex"
            >
              {t("Claim your founding spot")}
            </Link>
            <p className="mt-4 text-[15px] font-medium text-[#0F1729]/60">
              {t("Serving Pinecrest & Kendall — 33156, 33183, 33186")}
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Neighbor;
