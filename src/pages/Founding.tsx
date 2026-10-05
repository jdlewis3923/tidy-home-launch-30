/**
 * /founding — the door-hanger landing page. Price first, reserve second.
 * Mobile-first, bilingual through the shared t() layer, every load logged.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFoundingCounts } from "@/hooks/useFoundingCounts";
import { useGoogleListing, shortName, rankReviews, formatRating } from "@/lib/googleReviews";
import { FOUNDING_ZIPS, FOUNDING_CAP, FOUNDING_BENEFITS, LAUNCH_DATE_LONG, LAUNCH_DATE_LONG_ES } from "@/lib/launch";
import { lookupKeyFor, sizeFromBedrooms, VISITS_PER_MONTH, BILLED_MONTHLY, SIZE_PRICES, type CanonCadence, type CanonSize, type SizeSelection } from "@/lib/pricing-canon";
import { GIFT_ELIGIBLE_ADDONS } from "@/lib/addon-catalog";
import { PHONE_DISPLAY, PHONE_TEL } from "@/lib/landing";
import { supabase } from "@/integrations/supabase/client";
import LanguageToggle from "@/components/LanguageToggle";
import TidyLogo from "@/components/TidyLogo";

type Svc = "cleaning" | "lawn" | "detailing";
type Step = "services" | "sizes" | "price" | "reserve" | "done";
type Lawn = 1 | 2 | 3;
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
  zip, src, step: "services", services: [], beds: "", baths: "", lawn: null, car: null,
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
  const urlZip = params.get("zip") ?? "";
  const urlSrc = params.get("src") ?? "";
  const [s, setS] = useState<State>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || "null") as State | null;
      if (saved) return { ...saved, zip: isZip(urlZip) ? urlZip : saved.zip, src: urlSrc || saved.src, step: saved.step === "done" ? "services" : saved.step };
    } catch { /* fresh */ }
    return blank(isZip(urlZip) ? urlZip : "", urlSrc);
  });
  const set = (p: Partial<State>) => setS((o) => ({ ...o, ...p }));
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ok */ } }, [s]);

  const logged = useRef(false);
  useEffect(() => { if (!logged.current) { logged.current = true; logEvent("page_view", s, language); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lastStep = useRef(s.step);
  useEffect(() => { if (lastStep.current !== s.step) { lastStep.current = s.step; logEvent("step", s, language, s.step); } }, [s.step]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useFoundingCounts();
  const homes = s.zip && counts.data ? counts.data.byZip[s.zip] ?? 0 : null;
  const left = homes === null ? null : Math.max(0, FOUNDING_CAP - homes);
  const prices = usePrices();
  const listing = useGoogleListing();
  const launch = language === "es" ? LAUNCH_DATE_LONG_ES : LAUNCH_DATE_LONG;
  const scrollTo = useRef<HTMLDivElement>(null);
  const go = (step: Step) => { set({ step }); scrollTo.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

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
  const reviews = listing ? rankReviews(listing.reviews).slice(0, 3) : [];

  return (
    <div className="min-h-screen bg-background text-ink">
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

      {/* ABOVE THE FOLD — navy + gold, like the hanger */}
      <header className="bg-navy text-primary-foreground">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 pt-3">
          <TidyLogo size="sm" priority />
          <div className="rounded-lg bg-background"><LanguageToggle /></div>
        </div>
        <div className="mx-auto max-w-xl px-4 pb-6 pt-3">
          <h1 className="text-[2.1rem] font-extrabold leading-tight">{t("More life.")} <span className="text-gold">{t("Less chores.")}</span></h1>
          <p className="mt-1 text-base text-primary-foreground/85">{t("Three services. One subscription. More life for you.")}</p>
          <p data-testid="founding-left" className="mt-3 rounded-lg bg-primary-foreground/10 px-3 py-2 text-sm font-semibold">
            {left === null
              ? <>{FOUNDING_CAP} {t("founding homes per ZIP")} · {FOUNDING_ZIPS.join(" · ")}</>
              : left > 0
                ? <><span className="text-gold">{left} {t("of")} {FOUNDING_CAP}</span> {t("founding homes left in")} {s.zip}</>
                : <>{t("Founding homes are fully reserved in")} {s.zip} — {t("you're reserving at standard terms.")}</>}
          </p>
        </div>
      </header>

      <main>
        <div ref={scrollTo} className="mx-auto -mt-3 max-w-xl px-3">
          <section aria-label={t("Your price")} className="rounded-2xl border border-border bg-card p-4 shadow-xl">
            {s.step !== "done" && <p className="mb-3 text-center text-xs font-medium text-ink-faint">{t("See your price in 60 seconds. No card. No account.")}</p>}

            {/* ZIP first when unknown */}
            {!isZip(s.zip) && s.step !== "done" && (
              <fieldset className="mb-4">
                <legend className="text-sm font-bold">{t("Your ZIP code")}</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {FOUNDING_ZIPS.map((z) => <button key={z} type="button" className={`${chip} ${off}`} onClick={() => set({ zip: z })}>{z}</button>)}
                </div>
                <label className="mt-3 block text-xs font-semibold text-ink-faint" htmlFor="fz-other">{t("Somewhere else? Enter your ZIP")}</label>
                <input id="fz-other" inputMode="numeric" autoComplete="postal-code" maxLength={5} className={input} value={otherZip} onChange={(e) => setOtherZip(e.target.value.replace(/\D/g, ""))} />
                {outside && (waitDone
                  ? <p className="mt-3 rounded-lg bg-accent p-3 text-sm font-semibold">{t("Thanks — we'll email you when we reach")} {otherZip}.</p>
                  : <form onSubmit={joinWaitlist} className="mt-3 rounded-lg bg-accent p-3">
                      <p className="text-sm font-semibold">{t("We're not in your ZIP yet — we'll tell you when we are.")}</p>
                      <label htmlFor="fz-wait" className="mt-2 block text-xs font-semibold">{t("Email")}</label>
                      <input id="fz-wait" type="email" autoComplete="email" required className={input} value={waitEmail} onChange={(e) => setWaitEmail(e.target.value)} />
                      <button className={`${primaryBtn} mt-3`}>{t("Tell me when you're here")}</button>
                    </form>)}
              </fieldset>
            )}

            {s.step === "services" && (
              <div>
                <p className="text-sm font-bold">{t("Pick your services")}</p>
                <div className="mt-2 grid gap-2">
                  {SVCS.map((svc) => {
                    const picked = s.services.includes(svc);
                    return (
                      <button key={svc} type="button" aria-pressed={picked} className={`${chip} ${picked ? on : off} flex items-center justify-between text-left`}
                        onClick={() => set({ services: picked ? s.services.filter((x) => x !== svc) : [...s.services, svc] })}>
                        <span>{t(SVC_LABEL[svc])}</span>
                        <span className="text-xs font-medium text-ink-faint">{t("from")} {money(SIZE_PRICES[svc][1])}{per}</span>
                      </button>
                    );
                  })}
                </div>
                <button className={`${primaryBtn} mt-4`} disabled={!s.services.length || !isZip(s.zip)} onClick={() => go("sizes")}>{t("Next")} →</button>
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
                      {([[1, "Small"], [2, "Standard"], [3, "Large"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={s.lawn === v} className={`${chip} ${s.lawn === v ? on : off}`} onClick={() => set({ lawn: v })}>{t(l)}</button>)}
                    </div>
                    <p className="mt-2 text-xs text-ink-faint">{t("We confirm from aerial imagery before your first visit — nothing to measure.")}</p>
                    <Cadence value={s.cadence.lawn} onChange={(c) => set({ cadence: { ...s.cadence, lawn: c } })} t={t} chip={chip} on={on} off={off} />
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
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat label={t("Monthly total")} value={`${money(total)}${per}`} big />
                    <Stat label={t("Visits a month")} value={String(visits)} />
                    <Stat label={t("Per visit")} value={visits ? money(total / visits) : "—"} />
                  </div>
                )}
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
                    {reviews.map((r, i) => <p key={r.id ?? i} className="mt-2 text-sm">“{r.text.length > 140 ? r.text.slice(0, 137) + "…" : r.text}” <span className="text-primary-foreground/70">— {shortName(r.author)}</span></p>)}
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
        <section className="mx-auto max-w-xl px-4 py-8">
          <h2 className="text-center text-xs font-bold uppercase tracking-widest text-primary">{t("Founding member benefits")}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {FOUNDING_BENEFITS.map((b) => <li key={b} className="rounded-xl border border-border bg-card p-3 text-sm font-semibold"><span className="text-gold">✓</span> {t(b)}</li>)}
          </ul>
        </section>

        <section className="bg-accent/50 py-8">
          <div className="mx-auto max-w-xl px-4">
            <h2 className="text-2xl font-extrabold">{t("Plans from $45 a month.")}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between rounded-xl bg-card p-3"><span>{t("House Cleaning")}</span><b>{t("from")} $139 {t("a month")}</b></li>
              <li className="flex justify-between rounded-xl bg-card p-3"><span>{t("Lawn Care")}</span><b>{t("from")} $45 {t("a month")}</b></li>
              <li className="flex justify-between rounded-xl bg-card p-3"><span>{t("Car Care")}</span><b>{t("from")} $149 {t("a month")}</b></li>
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-xl px-4 py-8">
          <h2 className="text-xl font-extrabold">{t("How it works")}</h2>
          <ol className="mt-3 space-y-3">
            {[["Scan", "See your price in 60 seconds. No account, no call."], ["Pick your day", "Any weekday or Saturday, mornings or afternoons."], ["Meet your Pro", "The same background-checked pro for each service, every visit."]].map(([h, d], i) => (
              <li key={h} className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold font-extrabold text-navy">{i + 1}</span><div><p className="font-bold">{t(h)}</p><p className="text-sm text-ink-faint">{t(d)}</p></div></li>
            ))}
          </ol>
        </section>

        <section className="bg-navy py-6 text-primary-foreground">
          <ul className="mx-auto flex max-w-xl flex-wrap justify-center gap-x-4 gap-y-2 px-4 text-xs font-semibold">
            {["Licensed & Insured", "Background-Checked Pros", "Photo-Verified Every Visit", "Cancel Anytime", "48-hour fix guarantee"].map((x) => <li key={x}><span className="text-gold">✓</span> {t(x)}</li>)}
          </ul>
        </section>

        <section className="mx-auto max-w-xl px-4 py-8">
          <Link to={`/refer${language === "es" ? "?lang=es" : ""}`} className="block rounded-2xl border-2 border-gold bg-gold/10 p-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/60">
            <p className="text-lg font-extrabold">{t("Give $50, Get $50")}</p>
            <p className="text-sm text-ink-faint">{t("Share Tidy with a neighbor — you both get $50 off.")} →</p>
          </Link>
          <p className="mt-6 text-center text-sm">{t("Questions?")} <a href={`tel:${PHONE_TEL}`} onClick={() => logEvent("tap_to_call", s, language)} className="inline-flex min-h-[44px] items-center font-bold text-primary underline">{PHONE_DISPLAY}</a></p>
          <p className="text-center text-sm font-semibold">{t("Cancel anytime. No contracts.")}</p>
          <p className="mt-4 text-center text-xs text-ink-faint">{t("Serving Pinecrest, Kendall and Kendall West")} · {FOUNDING_ZIPS.join(" · ")}</p>
          <p className="mt-2 text-center text-xs"><Link to="/terms" className="underline">{t("Terms")}</Link> · <Link to="/privacy" className="underline">{t("Privacy Policy")}</Link></p>
        </section>
      </main>
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
function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return <div className="rounded-xl bg-accent p-2"><p className={`${big ? "text-xl" : "text-lg"} font-extrabold`}>{value}</p><p className="text-[11px] text-ink-faint">{label}</p></div>;
}
function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return <div><label htmlFor={id} className="text-xs font-semibold">{label}</label>{children}{error && <p className="mt-1 text-xs text-destructive">{error}</p>}</div>;
}
