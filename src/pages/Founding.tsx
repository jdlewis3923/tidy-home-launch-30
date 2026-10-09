/**
 * /founding — the door-hanger landing page. Price first, reserve second.
 * Mobile-first, bilingual through the shared t() layer, every load logged.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFoundingCounts } from "@/hooks/useFoundingCounts";
import { useGoogleListing, shortName, pickReview, formatRating } from "@/lib/googleReviews";
import { FOUNDING_ZIPS, FOUNDING_CAP, FOUNDING_BENEFITS, LAUNCH_DATE_LONG, LAUNCH_DATE_LONG_ES } from "@/lib/launch";
import { LAWN_GRASS_ONLY_NOTE, LAWN_OVER_OPTION, lookupKeyFor, sizeFromBedrooms, VISITS_PER_MONTH, BILLED_MONTHLY, SIZE_PRICES, type CanonCadence, type CanonSize, type SizeSelection } from "@/lib/pricing-canon";
import { GIFT_ELIGIBLE_ADDONS } from "@/lib/addon-catalog";
import { PHONE_DISPLAY, PHONE_TEL } from "@/lib/landing";
import { supabase } from "@/integrations/supabase/client";
import LanguageToggle from "@/components/LanguageToggle";
import TidyLogo from "@/components/TidyLogo";
import Reveal from "@/components/motion/Reveal";
import SparkleField from "@/components/landing/SparkleField";
import { ArrowRight, CalendarDays, Camera, CarFront, Clock3, Gift, Leaf, LockKeyhole, ShieldCheck, Sparkles, Star, UserRoundCheck } from "lucide-react";
import foundingMobileVideo from "@/assets/homepage-mobile-hero-20261004b.mp4.asset.json";
import foundingMobilePoster from "@/assets/homepage-mobile-hero-poster-20261004b.jpg.asset.json";
import foundingDesktopVideo from "@/assets/homepage-desktop-hero-20261004b.mp4.asset.json";
import foundingDesktopPoster from "@/assets/homepage-desktop-hero-poster-20261004b.jpg.asset.json";
import cleaningPlan from "@/assets/founding-plan-cleaning.png";
import lawnPlan from "@/assets/founding-plan-lawn.png";
import carPlan from "@/assets/founding-plan-car.png";
import scanImage from "@/assets/founding-how-scan.jpg";
import calendarImage from "@/assets/founding-how-calendar.jpg";
import proImage from "@/assets/founding-pro-step.jpg";

type Svc = "cleaning" | "lawn" | "detailing";
type Step = "zip" | "services" | "sizes" | "price" | "reserve" | "done";
type Lawn = 1 | 2 | 3 | "quote";
type State = {
  zip: string; src: string; step: Step; services: Svc[];
  beds: string; baths: string; lawn: Lawn | null; car: CanonSize | null;
  cadence: Record<"cleaning" | "lawn", CanonCadence>; gifts: string[];
  first: string; last: string; email: string; phone: string; street: string; sms: boolean;
  day: string; time: "morning" | "afternoon";
};
const KEY = "tidy.founding.v1";
const SID = "tidy.founding.sid";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SVCS: Svc[] = ["cleaning", "lawn", "detailing"];
const SVC_LABEL: Record<Svc, string> = { cleaning: "House Cleaning", lawn: "Lawn Care", detailing: "Car Care" };
const CAD_LABEL: Record<CanonCadence, string> = { monthly: "Once a month", biweekly: "Every 2 weeks", weekly: "Weekly" };
const isZip = (z: string) => (FOUNDING_ZIPS as readonly string[]).includes(z);

const blank = (zip: string, src: string): State => ({
  zip, src, step: zip ? "services" : "zip", services: [], beds: "", baths: "", lawn: null, car: null,
  cadence: { cleaning: "biweekly", lawn: "biweekly" }, gifts: [], first: "", last: "", email: "", phone: "", street: "", sms: false, day: "", time: "morning",
});

function sessionId() {
  try {
    let s = sessionStorage.getItem(SID);
    if (!s) { s = crypto.randomUUID(); sessionStorage.setItem(SID, s); }
    return s;
  } catch { return "nostorage-" + Math.random().toString(36).slice(2, 12); }
}
function logEvent(event: string, s: Partial<State>, lang: string, step?: string) {
  void supabase.from("founding_events" as never).insert({
    session_id: sessionId(), event, step: step ?? null, src: s.src?.slice(0, 60) || null,
    zip: s.zip && /^\d{5}$/.test(s.zip) ? s.zip : null, lang,
  } as never).then(({ error }) => { if (error) console.warn("[founding] log", error.message); });
}

/** Monthly prices by lookup_key, read from Stripe; cached amounts on failure. */
function usePrices() {
  const [prices, setPrices] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    supabase.functions.invoke("founding-prices").then(({ data, error }) => {
      if (!error && data?.prices && Object.keys(data.prices).length) setPrices(data.prices);
      else setPrices({});
    });
  }, []);
  return prices;
}

export default function Founding() {
  const { t, language } = useLanguage();
  const [params] = useSearchParams();
  const urlSrc = params.get("src") ?? "";
  const [s, setS] = useState<State>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || "null") as State | null;
      const custom = params.get("service") === "lawn" && params.get("size") === "custom";
      if (custom) {
        const base = saved ?? blank("", urlSrc);
        return { ...base, src: urlSrc || base.src, services: base.services.includes("lawn") ? base.services : [...base.services, "lawn"], lawn: "quote", step: isZip(base.zip) ? "sizes" : "zip" };
      }
      if (saved) return { ...saved, src: urlSrc || saved.src, step: saved.step === "done" ? (isZip(saved.zip) ? "services" : "zip") : (!isZip(saved.zip) ? "zip" : saved.step) };
    } catch { /* fresh */ }
    return blank("", urlSrc);
  });
  const set = (p: Partial<State>) => setS((o) => ({ ...o, ...p }));
  const [motionOk, setMotionOk] = useState(false);
  const [quoteVisible, setQuoteVisible] = useState(true);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ok */ } }, [s]);
  useEffect(() => { setMotionOk(!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);

  const logged = useRef(false);
  useEffect(() => { if (!logged.current) { logged.current = true; logEvent("page_view", s, language); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lastStep = useRef(s.step);
  useEffect(() => { if (lastStep.current !== s.step) { lastStep.current = s.step; logEvent("step", s, language, s.step); } }, [s.step]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useFoundingCounts();
  const homes = s.zip && counts.data ? counts.data.byZip[s.zip] ?? 0 : null;
  const left = homes === null ? null : Math.max(0, FOUNDING_CAP - homes);
  const foundingFull = isZip(s.zip) && left === 0;
  const prices = usePrices();
  const listing = useGoogleListing();
  const launch = language === "es" ? LAUNCH_DATE_LONG_ES : LAUNCH_DATE_LONG;
  const quoteCardRef = useRef<HTMLElement>(null);
  // Every step change requests a scroll; the effect below runs after React has rendered the new step.
  const [scrollRequest, setScrollRequest] = useState(0);
  const scrollQuoteIntoView = () => quoteCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const go = (step: Step, patch: Partial<State> = {}) => {
    set({ ...patch, step });
    setScrollRequest((n) => n + 1);
  };
  useEffect(() => {
    if (scrollRequest === 0) return;
    scrollQuoteIntoView();
  }, [scrollRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isPhone, setIsPhone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsPhone(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    const node = quoteCardRef.current;
    if (!node) return;
    // threshold 0: visible while any part of the card is on screen, hidden only once fully out.
    const observer = new IntersectionObserver(([entry]) => setQuoteVisible(entry.isIntersecting), { threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // ── quote math (each line its own Stripe price, quantity 1, no discounts) ──
  const cleanSize: SizeSelection | null = s.beds && s.baths ? (s.beds === "5" ? "quote" : sizeFromBedrooms(Number(s.beds), Number(s.baths))) : null;
  const sizeOf = (svc: Svc): SizeSelection | null => (svc === "cleaning" ? cleanSize : svc === "lawn" ? s.lawn : s.car);
  const lines = useMemo(() => s.services.map((svc) => {
    const size = sizeOf(svc);
    const cadence: CanonCadence = svc === "detailing" ? "monthly" : s.cadence[svc];
    if (size === null) return null;
    if (size === "quote") return { service: svc, size, cadence, monthly: 0, visits: 0, quote: true };
    const key = lookupKeyFor(svc, size, cadence);
    const cents = prices?.[key];
    const monthly = cents ? cents / 100 : BILLED_MONTHLY[svc][size][cadence];
    return { service: svc, size, cadence, monthly, visits: svc === "detailing" ? 3 : VISITS_PER_MONTH[cadence], quote: false, key };
  }), [s, prices, cleanSize]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = s.services.length > 0 && lines.every(Boolean);
  const priced = lines.filter((l) => l && !l.quote) as NonNullable<(typeof lines)[number]>[];
  const total = priced.reduce((n, l) => n + l.monthly, 0);
  const visits = priced.reduce((n, l) => n + l.visits, 0);
  const anyQuote = lines.some((l) => l?.quote);
  const giftCount = s.services.length >= 3 ? 2 : s.services.length === 2 ? 1 : 0;
  const giftPool = GIFT_ELIGIBLE_ADDONS.filter((a) => s.services.includes(a.service));
  useEffect(() => { if (prices && Object.keys(prices).length === 0) logEvent("price_fallback", s, language); }, [prices]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── submit ──
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ updated: boolean; founding: boolean } | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const phoneOk = /^\+?1?\D*\d{3}\D*\d{3}\D*\d{4}\D*$/.test(s.phone);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email);
  const formOk = s.first.trim() && s.last.trim() && emailOk && phoneOk && s.street.trim().length >= 5 && s.day && isZip(s.zip);

  async function reserve(e: React.FormEvent) {
    e.preventDefault();
    if (!formOk || busy) return;
    setBusy(true); setErr("");
    const body = {
      page: "founding", first_name: s.first, last_name: s.last, email: s.email, phone: s.phone, sms_consent: s.sms,
      services: s.services, street: s.street, city: "Miami", zip: s.zip, preferred_day: s.day, preferred_time: s.time,
      heard_from: s.src.startsWith("hanger") || s.src.startsWith("doorhanger") ? "door_hanger" : "other",
      heard_other: s.src || undefined, lang: language, src: s.src || undefined, session_id: sessionId(),
      gift_addons: s.gifts.slice(0, giftCount), website: honeypot.current?.value || "",
      lines: lines.filter(Boolean).map((l) => ({ service: l!.service, size: l!.size, cadence: l!.service === "detailing" ? null : l!.cadence, monthly: l!.monthly, visits_per_month: l!.visits })),
      quote: { total, visits, src: "founding", beds: s.beds, baths: s.baths },
    };
    const { data, error } = await supabase.functions.invoke("reservation-submit", { body });
    setBusy(false);
    if (error || !data?.ok) { setErr(t("We couldn't save that. Check your details and try again, or call us.")); return; }
    setResult({ updated: !!data.updated, founding: data.founding !== false });
    void counts.refetch();
    go("done");
    try { sessionStorage.removeItem(KEY); } catch { /* ok */ }
  }

  // ── out-of-area ──
  const [otherZip, setOtherZip] = useState("");
  const [waitEmail, setWaitEmail] = useState("");
  const [waitDone, setWaitDone] = useState(false);
  const outside = /^\d{5}$/.test(otherZip) && !isZip(otherZip);
  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(waitEmail)) return;
    await supabase.functions.invoke("submit-waitlist", { body: { email: waitEmail, zip: otherZip, source: `founding${s.src ? `:${s.src}` : ""}`.slice(0, 64) } });
    logEvent("out_of_area", { ...s, zip: otherZip }, language);
    setWaitDone(true);
  }

  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const per = t("/mo");
  const chip = "min-h-[44px] rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/60";
  const on = "border-gold bg-gold/15 text-ink";
  const off = "border-border bg-card text-ink hover:border-primary/50";
  const input = "mt-1 w-full min-h-[44px] rounded-xl border-2 border-border bg-card px-3 text-base text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/60 focus-visible:border-primary";
  const primaryBtn = "w-full min-h-[52px] rounded-xl bg-gold px-5 text-base font-extrabold text-navy shadow-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/60";
  const featuredReview = useMemo(() => {
    if (!listing) return null;
    const complete = listing.reviews.filter((review) => !/(?:…|\.\.\.)\s*$/.test(review.text.trim()));
    return pickReview(complete, s.services);
  }, [listing, s.services]);
  const reviewName = featuredReview ? (featuredReview.author?.trim().includes(" ") ? shortName(featuredReview.author) : t("Google reviewer")) : "";
  const addServiceAtPrice = (service: Svc) => {
    if (s.services.includes(service)) return;
    const additions: Partial<State> = { services: [...s.services, service] };
    if (service === "cleaning") { additions.beds = s.beds || "2"; additions.baths = s.baths || "1"; }
    if (service === "lawn") additions.lawn = s.lawn ?? 1;
    if (service === "detailing") additions.car = s.car ?? 1;
    // Starting size is preselected so the "from" price stays truthful; the visitor confirms it on the sizes step.
    go("sizes", additions);
  };

  return (
    <div className="founding-landing min-h-screen bg-background text-ink">
      <Helmet>
        <html lang={language} />
        <title>{t("Founding Homes · Cleaning, Lawn & Car Care in Pinecrest & Kendall | Tidy")}</title>
        <meta name="description" content={t("See your Tidy price in 60 seconds — house cleaning, lawn care and car care for Pinecrest, Kendall and Kendall West (33156, 33183, 33186). No card. No account.")} />
        <link rel="canonical" href="https://jointidy.co/founding" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://jointidy.co/founding" />
        <meta property="og:title" content={t("More life. Less chores. — Tidy founding homes")} />
        <meta property="og:description" content={t("Three services. One subscription. See your price in 60 seconds. Pinecrest · Kendall · Kendall West.")} />
        <meta property="og:image" content="https://jointidy.co/og-founding.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://jointidy.co/og-founding.jpg" />
      </Helmet>

      <header className="founding-landing-hero text-primary-foreground">
        {motionOk ? (
          <>
            <video src={foundingMobileVideo.url} poster={foundingMobilePoster.url} autoPlay loop muted playsInline preload="auto" aria-hidden="true" className="founding-hero-photo md:hidden" />
            <video src={foundingDesktopVideo.url} poster={foundingDesktopPoster.url} autoPlay loop muted playsInline preload="metadata" aria-hidden="true" className="founding-hero-photo hidden md:block" />
          </>
        ) : (
          <picture>
            <source media="(max-width: 767px)" srcSet={foundingMobilePoster.url} />
            <img src={foundingDesktopPoster.url} alt={t("Open Miami home interior looking toward the water")} width={1920} height={1080} loading="eager" fetchPriority="high" className="founding-hero-photo" />
          </picture>
        )}
        <div className="founding-hero-shade" />
        <SparkleField />
        <div className="founding-hero-shell">
          <div className="founding-topbar">
            <TidyLogo size="md" priority />
            <div className="founding-language"><LanguageToggle /></div>
          </div>
          <div className="founding-hero-copy">
            <h1><span className="founding-hero-title-line">{t("More life.")}</span><span className="founding-hero-title-line founding-hero-title-accent">{t("Less chores.")}</span></h1>
            <p>{t("Three services. One subscription.")}<br />{t("More life for you.")}</p>
            {listing && <a className="founding-rating-line" href={listing.maps_uri} target="_blank" rel="noreferrer"><span>★★★★★</span> {formatRating(listing.rating)} · {listing.total_count} {t("Google reviews")}</a>}
            <div data-testid="founding-left" className="founding-cap-pill">
              {!isZip(s.zip) || left === null
                ? <>{FOUNDING_CAP} {t("founding homes per ZIP")} · {FOUNDING_ZIPS.join(" · ")}</>
                : left > 0
                  ? <><strong>{left} {t("of")} {FOUNDING_CAP}</strong> {t("founding homes left in")} {s.zip}{left === FOUNDING_CAP ? <> · {t("Founding pricing is open now.")}</> : null}</>
                  : <>{t("Founding homes are fully reserved in")} {s.zip}</>}
            </div>
          </div>
        </div>
      </header>

      <main className="founding-landing-main">
        <div className="founding-quote-wrap">
          <section ref={quoteCardRef} data-testid="founding-quote-card" aria-label={t("Your price")} className="founding-quote-card">
            {s.step !== "done" && <p className="mb-3 text-center text-xs font-medium text-ink-faint">{t("See your price in 60 seconds. No card. No account.")}</p>}
            {isZip(s.zip) && left !== null && (
              <div data-testid="founding-live-count" className="founding-live-count" aria-live="polite">
                <span aria-hidden="true" />
                {left > 0
                  ? <><strong>{left} {t("of")} {FOUNDING_CAP}</strong> {t("founding homes left in")} {s.zip}{left === FOUNDING_CAP ? <> · {t("Founding pricing is open now.")}</> : null}</>
                  : <>{t("Founding homes are fully reserved in")} {s.zip}</>}
              </div>
            )}

            {/* ZIP is always the dedicated first step. QR codes carry source attribution only. */}
            {s.step === "zip" && (
              <fieldset>
                <legend className="text-sm font-bold">{t("Your ZIP code")}</legend>
                <div className="founding-zip-grid mt-2 grid gap-2">
                  {([['33156', 'Pinecrest'], ['33183', 'Kendall'], ['33186', 'Kendall West']] as const).map(([z, area]) => <button key={z} type="button" aria-label={`${z} ${t(area)}`} className={`${chip} ${s.zip === z ? on : off} founding-zip-choice`} onClick={() => set({ zip: z })}><strong>{z}</strong><span>{t(area)}</span></button>)}
                </div>
                <details className="founding-other-zip mt-3">
                  <summary>{t("My ZIP isn't listed")}</summary>
                  <label className="mt-3 block text-xs font-semibold text-ink-faint" htmlFor="fz-other">{t("Your ZIP code")}</label>
                  <input id="fz-other" inputMode="numeric" autoComplete="postal-code" maxLength={5} className={input} value={otherZip} onChange={(e) => setOtherZip(e.target.value.replace(/\D/g, ""))} />
                  {outside && (waitDone
                    ? <p className="mt-3 rounded-lg bg-accent p-3 text-sm font-semibold">{t("Thanks — we'll email you when we reach")} {otherZip}.</p>
                    : <form onSubmit={joinWaitlist} className="mt-3 rounded-lg bg-accent p-3">
                      <p className="text-sm font-semibold">{t("We're not in your ZIP yet — we'll tell you when we are.")}</p>
                      <label htmlFor="fz-wait" className="mt-2 block text-xs font-semibold">{t("Email")}</label>
                      <input id="fz-wait" type="email" autoComplete="email" required className={input} value={waitEmail} onChange={(e) => setWaitEmail(e.target.value)} />
                      <button className={`${primaryBtn} mt-3`}>{t("Tell me when you're here")}</button>
                    </form>)}
                </details>
                <button className={`${primaryBtn} mt-4`} disabled={!isZip(s.zip)} onClick={() => go("services")}>{t("Next")} →</button>
              </fieldset>
            )}

            {s.step === "services" && (
              <div>
                <button type="button" className="mb-3 text-xs font-semibold text-primary underline" onClick={() => go("zip")}>{s.zip} · {t("Change ZIP")}</button>
                <p className="text-sm font-bold">{t("Pick your services")}</p>
                <div className="mt-2 grid gap-2">
                  {SVCS.map((svc) => {
                    const picked = s.services.includes(svc);
                    const Icon = svc === "cleaning" ? Sparkles : svc === "lawn" ? Leaf : CarFront;
                    return (
                      <button key={svc} type="button" aria-pressed={picked} className={`${chip} ${picked ? on : off} flex items-center justify-between text-left`}
                        onClick={() => set({ services: picked ? s.services.filter((x) => x !== svc) : [...s.services, svc] })}>
                        <span className="flex items-center gap-2"><Icon className={`h-5 w-5 founding-service-icon founding-service-icon-${svc}`} aria-hidden="true" />{t(SVC_LABEL[svc])}</span>
                        <span className="text-xs font-medium text-ink-faint">{t("from")} {money(SIZE_PRICES[svc][1])}{per}</span>
                      </button>
                    );
                  })}
                </div>
                <button className={`${primaryBtn} mt-4`} disabled={!s.services.length} onClick={() => go("sizes")}>{t("Next")} →</button>
              </div>
            )}

            {s.step === "sizes" && (
              <div className="space-y-5">
                {s.services.includes("cleaning") && (
                  <fieldset>
                    <legend className="text-sm font-bold">{t("House Cleaning")} — {t("bedrooms")}</legend>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[["2", "Up to 2"], ["3", "3"], ["4", "4"], ["5", "5+"]].map(([v, l]) => <button key={v} type="button" aria-pressed={s.beds === v} className={`${chip} ${s.beds === v ? on : off}`} onClick={() => set({ beds: v })}>{t(l)}</button>)}
                    </div>
                    <p className="mt-3 text-xs font-semibold">{t("Bathrooms")}</p>
                    <div className="mt-1 grid grid-cols-5 gap-2">
                      {["1", "2", "2.5", "3", "4"].map((v) => <button key={v} type="button" aria-pressed={s.baths === v} className={`${chip} ${s.baths === v ? on : off}`} onClick={() => set({ baths: v })}>{v === "4" ? "4+" : v}</button>)}
                    </div>
                    <Cadence value={s.cadence.cleaning} onChange={(c) => set({ cadence: { ...s.cadence, cleaning: c } })} t={t} chip={chip} on={on} off={off} />
                  </fieldset>
                )}
                {s.services.includes("lawn") && (
                  <fieldset>
                    <legend className="text-sm font-bold">{t("Lawn Care")} — {t("yard size")}</legend>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {([[1, "Small", "up to 3,000 sq ft of lawn"], [2, "Standard", "3,000 – 7,000 sq ft of lawn"], [3, "Large", "7,000 – 12,000 sq ft of lawn"]] as const).map(([v, l, h]) => <button key={v} type="button" aria-pressed={s.lawn === v} className={`${chip} ${s.lawn === v ? on : off} flex flex-col items-start text-left leading-tight`} onClick={() => set({ lawn: v })}><span>{t(l)}</span><span className="mt-0.5 text-[11px] font-medium opacity-80">{t(h)}</span></button>)}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-ink-soft">{t(LAWN_GRASS_ONLY_NOTE)}</p>
                    <button type="button" aria-pressed={s.lawn === "quote"} className={`mt-2 w-full rounded-xl border-2 border-dashed px-3 py-2 text-left text-sm font-semibold ${s.lawn === "quote" ? "border-gold bg-gold/10 text-ink" : "border-border text-ink-soft hover:border-primary/50"}`} onClick={() => set({ lawn: "quote" })}>{t(LAWN_OVER_OPTION)} →</button>
                    {s.lawn !== "quote" && (<>
                    <Cadence value={s.cadence.lawn} onChange={(c) => set({ cadence: { ...s.cadence, lawn: c } })} t={t} chip={chip} on={on} off={off} />
                    </>)}
                  </fieldset>
                )}
                {s.services.includes("detailing") && (
                  <fieldset>
                    <legend className="text-sm font-bold">{t("Car Care")} — {t("your vehicle")}</legend>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {([[1, "Sedan"], [2, "SUV"], [3, "Truck, 3-row or van"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={s.car === v} className={`${chip} ${s.car === v ? on : off}`} onClick={() => set({ car: v })}>{t(l)}</button>)}
                    </div>
                    <p className="mt-2 text-xs text-ink-faint">{t("Shine Complete: 3 maintenance washes a month plus 2 full details a year. One flat monthly price.")}</p>
                  </fieldset>
                )}
                <div className="flex gap-2">
                  <button type="button" className={`${chip} ${off}`} onClick={() => go("services")}>← {t("Back")}</button>
                  <button className={primaryBtn} disabled={!ready} onClick={() => go("price")}>{t("See my price")} →</button>
                </div>
              </div>
            )}

            {s.step === "price" && (
              <div>
                {priced.length > 0 && (
                  <div className="founding-price-stats text-center">
                    <Stat label={t("Monthly total")} value={`${money(total)}${per}`} big className="founding-price-total" />
                    <Stat label={t("Visits a month")} value={String(visits)} />
                    <Stat label={t("Per visit")} value={visits ? money(total / visits) : "—"} />
                  </div>
                )}
                <p className="founding-launch-note">{t("Founding visits begin")} {launch}.</p>
                <p className="mt-2 text-center text-sm font-semibold text-primary">{t("Not right? We come back within 48 hours, free.")}</p>
                <ul className="mt-3 divide-y divide-border text-sm">
                  {lines.map((l) => l && (
                    <li key={l.service} className="flex justify-between py-2">
                      <span>{t(SVC_LABEL[l.service])}{l.service !== "detailing" ? ` · ${t(CAD_LABEL[l.cadence])}` : ` · ${t("3 washes a month")}`}</span>
                      <b>{l.quote ? t("Custom quote") : `${money(l.monthly)}${per}`}</b>
                    </li>
                  ))}
                </ul>
                {anyQuote && <p className="mt-2 rounded-lg bg-accent p-2 text-xs">{t("5+ bedrooms gets a custom quote. Reserve now and we'll send your price before anything is set.")}</p>}

                {SVCS.filter((service) => !s.services.includes(service)).map((service) => (
                  <button key={service} type="button" className="founding-bundle-offer" onClick={() => addServiceAtPrice(service)}>
                    <span><strong>{t("Add")} {t(SVC_LABEL[service])} {t("from")} {money(SIZE_PRICES[service][1])}{per}</strong> — {t(s.services.length >= 2 ? "and get two free premium add-ons every month." : "and your first premium add-on is free every month.")}</span><span aria-hidden="true">+</span>
                  </button>
                ))}

                {giftCount > 0 && (
                  <fieldset className="mt-4 rounded-xl border-2 border-gold/60 p-3">
                    <legend className="px-1 text-sm font-bold">{giftCount === 1 ? t("You've unlocked one free premium add-on every month") : t("You've unlocked two free premium add-ons every month")}</legend>
                    <div className="mt-1 grid gap-2">
                      {giftPool.map((a) => {
                        const picked = s.gifts.includes(a.key);
                        return <button key={a.key} type="button" aria-pressed={picked} className={`${chip} ${picked ? on : off} flex justify-between text-left`}
                          onClick={() => set({ gifts: picked ? s.gifts.filter((g) => g !== a.key) : [...s.gifts, a.key].slice(-giftCount) })}>
                          <span>{t(a.name)}</span><span className="text-xs text-ink-faint">{money(a.price)} {t("value")}</span></button>;
                      })}
                    </div>
                  </fieldset>
                )}

                {listing && (
                  <div className="mt-4 rounded-xl bg-navy p-3 text-primary-foreground">
                    <p className="text-sm font-bold"><span className="text-gold">★★★★★</span> {formatRating(listing.rating)} · {listing.total_count} {t("Google reviews")}</p>
                    {featuredReview && <p className="mt-2 text-sm">“{featuredReview.text}” <span className="text-primary-foreground/70">— {reviewName}</span></p>}
                    <a href={listing.maps_uri} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-gold underline">{t("Read them on Google")} →</a>
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <button type="button" className={`${chip} ${off}`} onClick={() => go("sizes")}>← {t("Back")}</button>
                  <button className={primaryBtn} onClick={() => go("reserve")}>{t("Reserve my spot")} →</button>
                </div>
              </div>
            )}

            {s.step === "reserve" && (
              <form onSubmit={reserve} noValidate className="space-y-3">
                <p className="text-sm font-bold">{t("Reserve — no card, no account, no password.")}</p>
                <input ref={honeypot} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />
                <div className="grid grid-cols-2 gap-2">
                  <Field id="f-first" label={t("First name")}><input id="f-first" autoComplete="given-name" className={input} value={s.first} onChange={(e) => set({ first: e.target.value })} required /></Field>
                  <Field id="f-last" label={t("Last name")}><input id="f-last" autoComplete="family-name" className={input} value={s.last} onChange={(e) => set({ last: e.target.value })} required /></Field>
                </div>
                <Field id="f-email" label={t("Email")} error={s.email && !emailOk ? t("Enter a valid email.") : ""}><input id="f-email" type="email" autoComplete="email" className={input} value={s.email} onChange={(e) => set({ email: e.target.value })} required /></Field>
                <Field id="f-phone" label={t("Mobile")} error={s.phone && !phoneOk ? t("Enter a 10-digit US mobile number.") : ""}><input id="f-phone" type="tel" inputMode="tel" autoComplete="tel-national" className={input} value={s.phone} onChange={(e) => set({ phone: e.target.value })} required /></Field>
                <Field id="f-street" label={t("Service address")}><input id="f-street" autoComplete="street-address" className={input} value={s.street} onChange={(e) => set({ street: e.target.value })} required /></Field>
                <Field id="f-zip" label={t("ZIP")}>
                  <select id="f-zip" className={input} value={s.zip} onChange={(e) => set({ zip: e.target.value })}>{FOUNDING_ZIPS.map((z) => <option key={z}>{z}</option>)}</select>
                </Field>
                <Field id="f-day" label={t("Preferred day")}>
                  <select id="f-day" className={input} value={s.day} onChange={(e) => set({ day: e.target.value })} required>
                    <option value="">{t("Choose a day")}</option>{DAYS.map((d) => <option key={d} value={d}>{t(d)}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("Time of day")}>
                  {(["morning", "afternoon"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={s.time === v} className={`${chip} ${s.time === v ? on : off}`} onClick={() => set({ time: v })}>{v === "morning" ? t("Mornings") : t("Afternoons")}</button>)}
                </div>
                <p className="text-xs text-ink-faint">{t("Mon–Sat, 8:00 AM – 6:00 PM ET.")}</p>
                <label className="flex min-h-[44px] items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-1 h-5 w-5" checked={s.sms} onChange={(e) => set({ sms: e.target.checked })} />
                  <span>{t("Text me about my reservation. Msg & data rates may apply. Reply STOP to opt out.")}</span>
                </label>
                {err && <p role="alert" className="text-sm font-semibold text-destructive">{err}</p>}
                <p className="founding-reserve-launch">{t("Founding visits begin")} {launch}. {t("No charge today — we'll confirm your day and your Pro the week before, and set up payment then.")}</p>
                <button className={primaryBtn} disabled={!formOk || busy}>{busy ? t("Saving…") : t("Reserve my spot — no charge")}</button>
                <p className="text-center text-xs text-ink-faint">{t("By reserving you agree to our")} <Link to="/terms" className="underline">{t("Terms")}</Link> {t("and")} <Link to="/privacy" className="underline">{t("Privacy Policy")}</Link>.</p>
                <button type="button" className={`${chip} ${off} w-full`} onClick={() => go("price")}>← {t("Back to my price")}</button>
              </form>
            )}

            {s.step === "done" && (
              <div className="text-center" role="status">
                <h2 className="text-2xl font-extrabold">{t("You're reserved. No charge today.")}</h2>
                {result?.updated && <p className="mt-1 text-sm font-semibold text-primary">{t("We found your earlier reservation and updated it.")}</p>}
                <p className="mt-2 font-semibold">{t("First visits begin")} {launch}.</p>
                <p className="mt-2 text-sm">{t("We'll contact you about a week before your first visit to confirm your day, your window and your Pro, and to set up payment then.")}</p>
                {!result?.founding && <p className="mt-2 text-sm">{t("Founding homes are fully reserved in")} {s.zip} — {t("you're reserving at standard terms.")}</p>}
                <ul className="mt-3 divide-y divide-border text-left text-sm">
                  {lines.map((l) => l && <li key={l.service} className="flex justify-between py-2"><span>{t(SVC_LABEL[l.service])}</span><b>{l.quote ? t("Custom quote") : `${money(l.monthly)}${per}`}</b></li>)}
                  {priced.length > 0 && <li className="flex justify-between py-2 font-bold"><span>{t("Monthly total")}</span><span>{money(total)}{per}</span></li>}
                  <li className="py-2">{t(s.day)} · {s.time === "morning" ? t("Mornings") : t("Afternoons")} · {s.zip}</li>
                  {s.gifts.length > 0 && <li className="py-2">{t("Free add-on")}: {s.gifts.map((g) => t(GIFT_ELIGIBLE_ADDONS.find((a) => a.key === g)?.name ?? g)).join(", ")}</li>}
                </ul>
                <p className="mt-3 text-xs text-ink-faint">{t("A confirmation email is on its way.")}</p>
              </div>
            )}
          </section>
        </div>

        {/* BELOW THE FOLD */}
        <Reveal as="section" className={`founding-benefits-section ${foundingFull ? "is-full" : ""}`}>
          {foundingFull ? (
            <div className="founding-standard-card"><ShieldCheck aria-hidden="true" /><p><strong>{t("Founding homes are fully reserved in")} {s.zip}</strong><span>{t("You're reserving at standard terms — same guarantee, same pros, cancel anytime.")}</span></p></div>
          ) : (
            <><h2>{t("Founding member benefits")}</h2>
            <ul className="founding-benefits-grid">
              {FOUNDING_BENEFITS.map((b, index) => {
                const Icon = [LockKeyhole, Star, Gift, UserRoundCheck][index];
                return <li key={b} style={{ animationDelay: `${index * 110}ms` }}><span><Icon aria-hidden="true" /></span><strong>{t(b)}</strong></li>;
              })}
            </ul></>
          )}
        </Reveal>

        <Reveal as="section" className="founding-plans-section">
          <div className="founding-section-shell">
            <p className="founding-eyebrow">{t("Simple, transparent pricing")}</p>
            <h2>{t("Plans from $45 a month.")}</h2>
            <p className="founding-section-lead">{t("Bundle the services you want. One simple bill. No hidden fees.")}</p>
            <ul className="founding-plan-grid">
              {[
                { svc: "cleaning" as Svc, label: "House Cleaning", price: 139, image: cleaningPlan, Icon: Sparkles, tone: "gold" },
                { svc: "lawn" as Svc, label: "Lawn Care", price: 45, image: lawnPlan, Icon: Leaf, tone: "green" },
                { svc: "detailing" as Svc, label: "Car Care", price: 149, image: carPlan, Icon: CarFront, tone: "blue" },
              ].map(({ svc, label, price, image, Icon, tone }, index) => (
                <li key={label} className="founding-plan-card" style={{ animationDelay: `${index * 120}ms` }}>
                  <picture><img src={image} alt="" width={1365} height={768} loading="lazy" /></picture>
                  <div><Icon className={`founding-plan-icon is-${tone}`} aria-hidden="true" /><span><strong>{t(label)}</strong><small>{t("from")} ${price} {t("a month")}</small></span><button type="button" aria-label={`${t("Add")} ${t(label)}`} onClick={() => go("sizes", { services: s.services.includes(svc) ? s.services : [...s.services, svc] })}>+</button></div>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal as="section" className="founding-how-section">
          <div className="founding-section-shell">
            <p className="founding-eyebrow">{t("Get started in minutes")}</p>
            <h2>{t("How it works")}</h2>
            <ol className="founding-how-grid">
              {[
                { h: "Scan", d: "See your price in 60 seconds. No account, no call.", image: scanImage },
                { h: "Pick your day", d: "Any weekday or Saturday, mornings or afternoons.", image: calendarImage },
                { h: "Meet your Pro", d: "The same background-checked pro for each service, every visit.", image: proImage },
              ].map(({ h, d, image }, i) => (
                <li key={h} style={{ animationDelay: `${i * 130}ms` }}><div className="founding-step-image"><img src={image} alt="" width={1200} height={900} loading="lazy" /><span>{i + 1}</span></div><strong>{t(h)}</strong><p>{t(d)}</p></li>
              ))}
          </ol>
          </div>
        </Reveal>

        <Reveal as="section" className="founding-trust-section">
          <ul>
            {[
              { label: "Licensed & Insured", Icon: ShieldCheck }, { label: "Background-Checked Pros", Icon: UserRoundCheck },
              { label: "Photo-Verified Every Visit", Icon: Camera }, { label: "48-hour fix guarantee", Icon: Clock3 }, { label: "Cancel Anytime", Icon: CalendarDays },
            ].map(({ label, Icon }) => <li key={label}><Icon aria-hidden="true" /><strong>{t(label)}</strong></li>)}
          </ul>
        </Reveal>

        <Reveal as="section" className="founding-footer-section">
          <Link to={`/refer${language === "es" ? "?lang=es" : ""}`} className="founding-refer-card">
            <Gift aria-hidden="true" /><span><strong>{t("Give $50, Get $50")}</strong><small>{t("Share Tidy with a neighbor — you both get $50 off.")}</small></span><ArrowRight aria-hidden="true" />
          </Link>
          <p className="founding-question">{t("Questions?")} <a href={`tel:${PHONE_TEL}`} onClick={() => logEvent("tap_to_call", s, language)}>{PHONE_DISPLAY}</a></p>
          <p className="founding-cancel">{t("Cancel anytime. No contracts.")}</p>
          <p className="founding-serving">{t("Serving Pinecrest, Kendall and Kendall West")} · {FOUNDING_ZIPS.join(" · ")}</p>
          <p className="founding-legal"><Link to="/terms">{t("Terms")}</Link> · <Link to="/privacy">{t("Privacy Policy")}</Link></p>
        </Reveal>
      </main>
      {isPhone && !quoteVisible && s.step !== "done" && (
        <button type="button" data-testid="founding-sticky-cta" className="founding-sticky-quote" onClick={scrollQuoteIntoView}>
          <span>{t("See your price — 60 seconds")}</span>
          {isZip(s.zip) && left !== null && <small>{left} {t("of")} {FOUNDING_CAP} {t("founding homes left in")} {s.zip}</small>}
        </button>
      )}
    </div>
  );
}

function Cadence({ value, onChange, t, chip, on, off }: { value: CanonCadence; onChange: (c: CanonCadence) => void; t: (s: string) => string; chip: string; on: string; off: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold">{t("How often")}</p>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {(["monthly", "biweekly", "weekly"] as CanonCadence[]).map((c) => <button key={c} type="button" aria-pressed={value === c} className={`${chip} ${value === c ? on : off}`} onClick={() => onChange(c)}>{t(CAD_LABEL[c])}</button>)}
      </div>
    </div>
  );
}
function Stat({ label, value, big, className = "" }: { label: string; value: string; big?: boolean; className?: string }) {
  return <div className={`founding-price-stat rounded-xl bg-accent p-2 ${className}`}><p className={`${big ? "text-xl" : "text-lg"} whitespace-nowrap font-extrabold`}>{value}</p><p className="text-[11px] text-ink-faint">{label}</p></div>;
}
function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return <div><label htmlFor={id} className="text-xs font-semibold">{label}</label>{children}{error && <p className="mt-1 text-xs text-destructive">{error}</p>}</div>;
}
