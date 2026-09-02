import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, MapPin, Lock, Gift, ShieldCheck, Tag, CalendarDays, UserCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead from "@/components/landing/SeoHead";
import Reveal from "@/components/landing/Reveal";
import LandingTicker from "@/components/landing/LandingTicker";
import FiveStarBand from "@/components/landing/FiveStarBand";
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

import heroAsset from "@/assets/neighbor-hero-v2.jpg.asset.json";
import heroMobileAsset from "@/assets/neighbor-hero-mobile-v2.jpg.asset.json";

import cleaningJpg from "@/assets/cleaning-interior.jpg";
import cleaningWebp from "@/assets/cleaning-interior.webp";
import lawnJpg from "@/assets/lawn-care.jpg";
import lawnWebp from "@/assets/lawn-care.webp";
import carJpg from "@/assets/car-detailing.jpg";
import carWebp from "@/assets/car-detailing.webp";

const promiseIcons = [Lock, Gift, ShieldCheck, MapPin];

/** The door hanger carries this number on both faces. */
export const PHONE_DISPLAY = "(786) 829-1141";
export const PHONE_TEL = "+17868291141";

/** The hanger's numbered three-step, verbatim apart from step 1 (they scanned already). */
const HOW_IT_WORKS = [
  { n: "1", Icon: Tag, title: "See your price", body: "Sixty seconds. No account, no call." },
  { n: "2", Icon: CalendarDays, title: "Pick your day", body: "Choose the day and time that suits you." },
  { n: "3", Icon: UserCheck, title: "Meet your Pro", body: "The same background-checked Pro, every visit." },
];

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
    includes: "Kitchen, baths, floors and dusting, same Pro every visit.",
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
  const fromDoorhanger = params.get("src") === "doorhanger";
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
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistAddress, setWaitlistAddress] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

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
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)("founding_spots_left", { _zip: zipParam });
      if (!cancelled && !error && typeof data === "number") setSpotsLeft(data);
    })();
    return () => { cancelled = true; };
  }, [zipParam]);

  const taken = spotsLeft === null ? null : FOUNDING_CAP - spotsLeft;
  const isFull = taken !== null && taken >= FOUNDING_CAP;

  const areaName = neighborhood ?? t("your neighborhood");
  const heroHeadline = neighborhood
    ? `${t("Be one of the first 25 homes in")} ${neighborhood}.`
    : t("Be one of the first 25 homes on your street");

  const scarcityLine = isFull
    ? `${t("Founding spots in")} ${areaName} ${t("are full.")}`
    : taken !== null && taken >= 3
      ? `${spotsLeft} ${t("of")} ${FOUNDING_CAP} ${t("founding spots left in")} ${areaName}.`
      : `${t("Founding pricing is capped at 25 homes in")} ${areaName}.`;

  const handleWaitlist = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!zipParam || !waitlistEmail.trim() || !waitlistAddress.trim()) return;
    setWaitlistSubmitting(true);
    setWaitlistError(null);
    const { data, error } = await supabase.functions.invoke("submit-waitlist", {
      body: {
        email: waitlistEmail.trim().toLowerCase(),
        address: waitlistAddress.trim(),
        zip: zipParam,
        source: `${landingSource}_full`,
      },
    });
    setWaitlistSubmitting(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      setWaitlistError(t("Couldn't save — try again in a moment."));
      return;
    }
    setWaitlistDone(true);
  };

  const ctaClick = (location: string) =>
    pushEvent("cta_click", {
      location,
      cta_text: "See your price — 60 seconds",
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
      
      <Navbar onOpenPopup={() => { window.location.assign(signupHref); }} />

      <main>
        {/* ── HERO: full-bleed photograph ───────────────────────────────── */}
        <section className="relative isolate min-h-[94svh] flex flex-col justify-end overflow-hidden">
          <picture>
            <source media="(max-width: 767px)" srcSet={heroMobileAsset.url} type="image/jpeg" />
            <img
              src={heroAsset.url}
              alt="A traditional South Miami home with barrel-tile roof, coral rock wall and paver driveway at golden hour"
              width={1600}
              height={1200}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_28%] md:object-[center_45%]"
            />
          </picture>
          {/* Hard scrim — daylight legibility, not decoration. */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0F1729] via-[#0F1729]/70 to-transparent" />

          <div className="absolute left-4 top-24 md:left-8">
            <TidyLogo size="sm" priority />
          </div>

          <div className="px-5 pb-8 pt-40 md:px-8 md:pb-16">

            <div className="mx-auto w-full max-w-3xl">
              <span className="inline-flex rounded-full bg-[#F7C618] px-3 py-1 text-[13px] font-extrabold uppercase tracking-wide text-[#0F1729]">
                {t(FOUNDING_OFFER.headline)}
              </span>
              {/* Echoes the printed door hanger's headline — the half-second
                  confirmation that this page is the thing they just scanned. */}
              <p className="mt-4 text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#F7C618] md:text-sm">
                {t("MORE LIFE. LESS CHORES.")}
              </p>
              {fromDoorhanger && (
                <p className="mt-2 text-[15px] font-semibold leading-snug text-white/90">
                  {t("Thanks for scanning — you’re looking at one of 25 founding spots in")} {areaName}.
                </p>
              )}
              <h1 className="mt-3 text-[2.35rem] leading-[1.06] font-extrabold text-white md:text-6xl">
                {heroHeadline}
              </h1>
              <p className="mt-4 text-[17px] font-semibold leading-snug text-white md:text-xl">
                {t("Cleaning, lawn and car care on one plan. One flat price per visit.")}
              </p>
              {isFull ? (
                <button
                  type="button"
                  onClick={() => setWaitlistOpen(true)}
                  className="animate-pulse-gold mt-7 flex w-full items-center justify-center rounded-full bg-[#F7C618] px-8 py-4 text-lg font-extrabold text-[#0F1729] active:scale-[0.99] md:w-auto md:inline-flex"
                >
                  {t("Join the waitlist")}
                </button>
              ) : (
                <Link
                  to={signupHref}
                  onClick={() => ctaClick("neighbor_hero")}
                  className="animate-pulse-gold mt-7 flex w-full items-center justify-center rounded-full bg-[#F7C618] px-6 py-4 text-center text-[17px] font-extrabold leading-tight text-[#0F1729] active:scale-[0.99] md:w-auto md:inline-flex md:text-lg"
                >
                  {t("See your price — 60 seconds")}
                </Link>
              )}
<p className="mt-3 text-[15px] font-normal text-white/85">
                {t("or call")}{" "}
                <a href={`tel:${PHONE_TEL}`} className="underline decoration-white/60 underline-offset-4 hover:text-white">
                  {PHONE_DISPLAY}
                </a>
              </p>

              {isFull && waitlistOpen && (
                waitlistDone ? (
                  <p className="mt-5 text-base font-semibold text-white">{t("You're on the list.")}</p>
                ) : (
                  <form onSubmit={handleWaitlist} className="mt-5 grid gap-3 md:max-w-lg">
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={waitlistEmail}
                      onChange={(event) => setWaitlistEmail(event.target.value)}
                      placeholder={t("Email Address")}
                      aria-label={t("Email Address")}
                      className="min-h-12 rounded-lg border border-white/30 bg-white px-4 text-base text-[#0F1729] placeholder:text-[#0F1729]/55 focus:outline-none focus:ring-2 focus:ring-[#F7C618]"
                    />
                    <input
                      type="text"
                      required
                      autoComplete="street-address"
                      value={waitlistAddress}
                      onChange={(event) => setWaitlistAddress(event.target.value)}
                      placeholder={t("Service Address")}
                      aria-label={t("Service Address")}
                      className="min-h-12 rounded-lg border border-white/30 bg-white px-4 text-base text-[#0F1729] placeholder:text-[#0F1729]/55 focus:outline-none focus:ring-2 focus:ring-[#F7C618]"
                    />
                    <button
                      type="submit"
                      disabled={waitlistSubmitting}
                      className="min-h-12 rounded-full bg-[#F7C618] px-6 text-base font-extrabold text-[#0F1729] disabled:opacity-60"
                    >
                      {waitlistSubmitting ? t("saving…") : t("Join the waitlist")}
                    </button>
                    {waitlistError && <p className="text-sm font-semibold text-white">{waitlistError}</p>}
                  </form>
                )
              )}
              <p className="mt-3 text-[15px] font-medium text-white/85">
                {t(ENTRY_PRICE_COPY)} · {t("No contract. Cancel anytime.")}
              </p>
              <FiveStarBand neighborhoods={neighborhood ?? t("Pinecrest and Kendall")} />
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
          {/* Static, never scrolling: this is read standing in a driveway, so
              nothing may clip mid-word or make the reader wait for a loop. */}
          <div className="mt-5 border-y border-white/10 py-3">
            <ul className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-5 text-center">
              {[
                t("Locked founding rate"),
                t("One free premium add-on"),
                t("First visit perfect or it’s free"),
                t("Same Pro every visit"),
              ].map(item => (
                <li key={item} className="text-[13px] font-bold uppercase tracking-wide text-white/80 md:text-[15px]">
                  {item}
                </li>
              ))}
            </ul>
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

{/* ── HOW IT WORKS: the hanger's numbered three-step ───────────── */}
        <section className="bg-white px-5 py-14 md:px-8 md:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-[26px] font-extrabold leading-tight text-[#0F1729] md:text-4xl">
              {t("How it works")}
            </h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
              {HOW_IT_WORKS.map((step, i) => (
                <Reveal key={step.n} delay={i * 70}>
                  <li className="h-full">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#F7C618]/15">
                        <step.Icon className="h-5 w-5 text-[#0F1729]" aria-hidden="true" />
                      </span>
                      <span className="text-[26px] font-extrabold leading-none text-[#F7C618]">{step.n}</span>
                    </div>
                    <h3 className="mt-3 text-[17px] font-bold text-[#0F1729]">{t(step.title)}</h3>
                    <p className="mt-1.5 text-[15px] leading-snug text-[#0F1729]/70">{t(step.body)}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ── CLOSING CTA ───────────────────────────────────────────────── */}
        <section className="bg-white px-5 py-16 text-center md:px-8 md:py-20">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-[28px] font-extrabold leading-tight text-[#0F1729] md:text-4xl">
              {neighborhood
                ? `${t("Claim your spot in")} ${neighborhood}.`
                : t("See your price — 60 seconds")}
            </h2>
            <p className="mt-3 text-[17px] text-[#0F1729]/70">
              {t("See your price in 60 seconds. No contract.")}
            </p>
            {isFull ? (
              <button
                type="button"
                onClick={() => { setWaitlistOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="animate-pulse-gold mt-7 flex w-full items-center justify-center rounded-full bg-[#F7C618] px-8 py-4 text-lg font-extrabold text-[#0F1729] active:scale-[0.99] md:w-auto md:inline-flex"
              >
                {t("Join the waitlist")}
              </button>
            ) : (
              <Link
                to={signupHref}
                onClick={() => ctaClick("neighbor_footer")}
                className="animate-pulse-gold mt-7 flex w-full items-center justify-center rounded-full bg-[#F7C618] px-6 py-4 text-center text-[17px] font-extrabold leading-tight text-[#0F1729] active:scale-[0.99] md:w-auto md:inline-flex md:text-lg"
              >
                {t("See your price — 60 seconds")}
              </Link>
            )}
            <p className="mt-4 text-[15px] font-medium text-[#0F1729]/60">
              {t("Serving Pinecrest, Kendall and Kendall West.")} 33156 · 33183 · 33186
            </p>
          </div>
        </section>
      </main>

      {/* Sticky action bar — same label as the hero so the promise never
          changes, with the hanger's phone number beside it. */}
      {!isFull && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#0F1729]/10 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-3">
            <Link
              to={signupHref}
              onClick={() => ctaClick("neighbor_sticky")}
              className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-[#F7C618] px-4 text-center text-[15px] font-extrabold leading-tight text-[#0F1729] active:scale-[0.99]"
            >
              {t("See your price — 60 seconds")}
            </Link>
            <a
              href={`tel:${PHONE_TEL}`}
              aria-label={`${t("or call")} ${PHONE_DISPLAY}`}
              className="flex min-h-12 items-center rounded-full border border-[#0F1729]/15 px-4 text-[15px] font-extrabold text-[#0F1729]"
            >
              {t("Call now")}
            </a>
          </div>
        </div>
      )}
      <div className="h-20 md:hidden" aria-hidden="true" />

      <Footer />
    </div>
  );
};

export default Neighbor;
