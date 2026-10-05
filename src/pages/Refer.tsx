import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, Gift, UserPlus, Sparkles, MapPin, ShieldCheck, LockKeyhole, ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead from "@/components/landing/SeoHead";
import Reveal from "@/components/landing/Reveal";
import SparkleField from "@/components/landing/SparkleField";
import SectionDecor from "@/components/landing/SectionDecor";
import LandingTicker from "@/components/landing/LandingTicker";
import LpFinalCta from "@/components/landing/LpFinalCta";
import { SERVICE_AREA_TRUST } from "@/lib/landing";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import { pushEvent } from "@/lib/tracking";
import { PrimaryCtaProvider, usePrimaryCta } from "@/hooks/usePrimaryCta";
import { useLanguage } from "@/contexts/LanguageContext";
import referDesktop from "@/assets/refer-homes-desktop.png.asset.json";
import referMobile from "@/assets/refer-homes-mobile.png.asset.json";

/**
 * /refer — public marketing surface for the existing
 * REFERRAL_50_OFF_FIRST_MONTH coupon flow. No new backend; if a user is
 * signed in we surface their referral code, otherwise we show a sign-in nudge.
 */
const Refer = () => (
  <PrimaryCtaProvider>
    <ReferInner />
  </PrimaryCtaProvider>
);

const ReferInner = () => {
  const [code, setCode] = useState<string | null>(null);
  const [creditCents, setCreditCents] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const { getCtaProps, openPopup, popupMode } = usePrimaryCta();
  const { t } = useLanguage();

  // Lazy-load Supabase only if dashboard auth is on, to avoid touching
  // the bundle when this page is browsed pre-launch.
  useEffect(() => {
    let active = true;
    if (!CUSTOMER_DASHBOARD_ENABLED) {
      setAuthLoaded(true);
      return;
    }
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        const user = data.session?.user;
        if (!user) return;

        // ensure_referral_code() is a SECURITY DEFINER RPC: it returns this
        // caller's code and CREATES one when the profile predates the trigger.
        const { data: rpcCode, error: rpcError } = await supabase.rpc("ensure_referral_code");
        if (!active) return;
        if (rpcError || !rpcCode) {
          console.error("[refer] ensure_referral_code failed", rpcError?.message ?? "empty code");
          setCodeError(true);
        } else {
          setCodeError(false);
          setCode(rpcCode as string);
        }

        // Sum unspent credits (status converted, not yet credited out).
        const { data: refRows } = await supabase
          .from("referrals")
          .select("credit_cents,status")
          .eq("referrer_user_id", user.id);
        if (active && refRows) {
          const sum = refRows
            .filter((r) => r.status === "converted" || r.status === "credited")
            .reduce((acc, r) => acc + (r.credit_cents ?? 0), 0);
          setCreditCents(sum);
        }
      } catch (err) {
        console.error("[refer] referral code load failed", err);
        if (active) setCodeError(true);
      } finally {
        if (active) setAuthLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [retryTick]);

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`https://jointidy.co/refer?promo=${code}`);
      setCopied(true);
      pushEvent("cta_click", { cta_id: "refer_copy", cta_text: "Copy referral link" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const navCta = getCtaProps({ trackingId: "refer_nav", ctaText: "Book in about 2 minutes" });
  const becomeCustomerCta = getCtaProps({ trackingId: "refer_signup", ctaText: "Become a customer" });

  const handleNavCta = () => {
    if (popupMode) openPopup();
    else window.location.href = navCta.to;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SeoHead
        title={t("Refer a Neighbor — Give $50, Get $50 | Tidy Home Concierge")}
        description={t(
          "Refer a neighbor in Pinecrest or Kendall (33156 · 33183 · 33186). They get $50 off their first month, you get $50 off yours. No limit, no fine print.",
        )}
        canonical="https://jointidy.co/refer"
        priceRange="$45–$916"
      />
      <Navbar onOpenPopup={handleNavCta} />

      {/* HERO */}
      <section className="editorial-offer-hero relative min-h-[calc(100svh-1rem)] pt-28 pb-40 px-4 overflow-hidden">
        <picture className="absolute inset-0">
          <source media="(max-width: 767px)" srcSet={referMobile.url} />
          <img src={referDesktop.url} alt="Palm-lined neighborhood with two homes" className="w-full h-full object-cover" loading="eager" fetchPriority="high" />
        </picture>
        <div className="absolute inset-0 refer-editorial-scrim" />
        <div className="relative z-10 max-w-3xl mx-auto text-center text-navy">
          <span className="text-xs uppercase tracking-[0.28em] text-primary font-bold">{t("Refer & Earn")}</span>
          <h1 className="mt-3 text-5xl md:text-7xl font-extrabold leading-[0.9] text-balance">
            {t("Give $50,")}<br />{t("Get $50")}
          </h1>
          <p className="mt-5 text-base md:text-lg max-w-xl mx-auto leading-snug font-medium">
            {t("Refer a neighbor in Pinecrest or Kendall. They get $50 off their first month. You get $50 off yours.")}
          </p>

          <div className="mt-7 flex items-center justify-center gap-3 md:gap-8">
            <div className="offer-reward-card -rotate-2">
              <span>{t("Your neighbor")}</span><strong>$50</strong><small>{t("off their first month")}</small>
            </div>
            <ArrowRight className="w-8 h-8 text-primary shrink-0" aria-hidden="true" />
            <div className="offer-reward-card rotate-2">
              <span>{t("You")}</span><strong>$50</strong><small>{t("off your next month")}</small>
            </div>
          </div>

          <a href="#referral-link" className="cta-arrow cta-press mt-7 inline-flex w-full max-w-md items-center justify-center bg-gold text-gold-foreground font-bold px-7 py-4 rounded-xl">
            {t("Get your referral link")} <span className="arrow ml-1">→</span>
          </a>
          <p className="mt-2 text-xs font-medium">{t("No cap. No expiration. No fine print.")}</p>
        </div>
        <div className="absolute z-20 bottom-5 left-4 right-4 max-w-4xl md:mx-auto service-benefit-bar">
          <div><span className="service-benefit-icon"><MapPin /></span><strong>{t("Works in Pinecrest & Kendall")}</strong></div>
          <div><span className="service-benefit-icon"><ShieldCheck /></span><strong>{t("The same pro for each service, every visit")}</strong></div>
          <div><span className="service-benefit-icon"><LockKeyhole /></span><strong>{t("Cancel anytime")}</strong></div>
        </div>
      </section>

      <LandingTicker />

      {/* HOW IT WORKS */}
      <section className="relative bg-background py-16 px-4 overflow-hidden">
        <SectionDecor tone="primary" />
        <div className="relative max-w-5xl mx-auto">
          <Reveal className="text-center mb-10">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("How it works")}</span>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-3">{t("Three steps. Two rewards.")}</h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                Icon: Copy,
                title: "Share your link",
                body: "Copy your unique referral link and send it to a neighbor in 33156, 33183, or 33186.",
              },
              {
                Icon: UserPlus,
                title: "They sign up",
                body: "Your neighbor checks out with your link. $50 is automatically applied to their first month.",
              },
              {
                Icon: Gift,
                title: "You both save",
                body: "Once their first invoice clears, $50 is credited to your next month. No cap, stack as many as you want.",
              },
            ].map(({ Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 80}>
                <div className="bg-card border rounded-xl p-6 h-full hover-lift">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center font-bold text-sm mb-4">
                    {i + 1}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-primary" aria-hidden="true" />
                    <h3 className="text-base font-bold text-foreground">{t(title)}</h3>
                  </div>
                  <p className="text-sm text-text-mid leading-relaxed">{t(body)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* REFERRAL CODE BLOCK */}
      <section id="referral-link" className="relative bg-section-alt py-16 px-4 overflow-hidden scroll-mt-24">
        <SectionDecor tone="gold" />
        <div className="relative max-w-2xl mx-auto">
          <Reveal>
            <div className="bg-card border rounded-2xl p-6 md:p-8 text-center shadow-sm">
              <Sparkles className="w-6 h-6 text-gold mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                {code
                  ? t("Your referral link")
                  : codeError
                    ? t("We couldn't load your referral link")
                    : t("Sign in to get your link")}
              </h2>

              {!authLoaded && <p className="text-sm text-text-mid mt-3">{t("Loading…")}</p>}

              {authLoaded && code && (
                <>
                  <p className="text-sm text-text-mid mt-2">
                    {t("Share this link with a neighbor. They save $50, you save $50.")}
                  </p>
                  <div className="mt-5 flex items-center gap-2 bg-muted rounded-lg p-2">
                    <code className="flex-1 text-left text-sm font-mono text-foreground truncate px-2">
                      jointidy.co/refer?promo={code}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="cta-press inline-flex items-center gap-1.5 bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-4 py-2 rounded-md text-sm transition-colors"
                      aria-label="Copy referral link"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? t("Copied") : t("Copy")}
                    </button>
                  </div>
                  <p className="mt-4 text-xs text-text-mid">
                    {t("Credits earned:")}{" "}
                    <span className="font-semibold text-foreground">${(creditCents / 100).toFixed(2)}</span>
                    {creditCents === 0 && ` ${t("— your first referral starts the meter.")}`}
                  </p>
                </>
              )}

              {authLoaded && !code && codeError && (
                <>
                  <p className="text-sm text-text-mid mt-3">
                    {t(
                      "Something went wrong on our side — your link was not created. Try again, or call us at (786) 829-1141.",
                    )}
                  </p>
                  <button
                    onClick={() => {
                      setCodeError(false);
                      setAuthLoaded(false);
                      setRetryTick((n) => n + 1);
                    }}
                    className="cta-press mt-5 bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                  >
                    {t("Try again")}
                  </button>
                </>
              )}

              {authLoaded && !code && !codeError && (
                <>
                  <p className="text-sm text-text-mid mt-3">
                    {t(
                      "Active customers get a unique referral link in their dashboard. Log in to grab yours and start earning.",
                    )}
                  </p>
                  <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                      to="/login"
                      onClick={() =>
                        pushEvent("cta_click", { cta_id: "refer_login", cta_text: "Log in to get your code" })
                      }
                      className="cta-arrow cta-press bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                    >
                      {t("Log in to get your code")} <span className="arrow">→</span>
                    </Link>
                    <Link
                      to={becomeCustomerCta.to}
                      onClick={becomeCustomerCta.onClick}
                      className="cta-arrow cta-press bg-card border hover:bg-muted text-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                    >
                      {t("Become a customer first")} <span className="arrow">→</span>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* FINAL CTA — rich navy with bouncing logo + sparkles */}
      <LpFinalCta
        headline={t("Not a member yet? Start with a plan.")}
        subhead={t("Lock in your monthly price, then send your link to a neighbor.")}
        ctaLabel={t("Book in about 2 minutes")}
        trackingId="refer_final"
      />

      <Footer />
    </div>
  );
};

export default Refer;
