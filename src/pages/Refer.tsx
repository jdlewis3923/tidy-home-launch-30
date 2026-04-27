import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, Gift, UserPlus, Sparkles, MapPin } from "lucide-react";
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
  const { getCtaProps, openPopup, popupMode } = usePrimaryCta();

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

        // Read or backfill referral_code on the profile.
        const { data: profile } = await supabase
          .from("profiles")
          .select("referral_code")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!active) return;

        let resolvedCode = profile?.referral_code ?? null;
        if (!resolvedCode) {
          // Trigger normally seeds it; if a legacy profile is missing one,
          // the SQL backfill in the migration handled it. Last-resort:
          // re-read once after a small delay (handled below as fallback).
          const { data: retry } = await supabase
            .from("profiles")
            .select("referral_code")
            .eq("user_id", user.id)
            .maybeSingle();
          resolvedCode = retry?.referral_code ?? null;
        }
        if (resolvedCode) setCode(resolvedCode);

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
      } catch {
        /* unauthenticated or auth not yet available — fall through */
      } finally {
        if (active) setAuthLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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

  const navCta = getCtaProps({ trackingId: "refer_nav", ctaText: "Book in 60 seconds" });
  const becomeCustomerCta = getCtaProps({ trackingId: "refer_signup", ctaText: "Become a customer" });

  const handleNavCta = () => {
    if (popupMode) openPopup();
    else window.location.href = navCta.to;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SeoHead
        title="Refer a Neighbor — Give $50, Get $50 | Tidy Home Services"
        description="Refer a neighbor in Pinecrest or Kendall (33156 · 33183 · 33186). They get $50 off their first month, you get $50 off yours. No limit, no fine print."
        canonical="https://jointidy.co/refer"
        priceRange="$85–$459"
      />
      <Navbar onOpenPopup={handleNavCta} />

      {/* HERO */}
      <section className="relative pt-32 pb-16 px-4 bg-gradient-to-b from-navy to-primary-deep overflow-hidden">
        <SparkleField />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <span className="text-xs uppercase tracking-widest text-gold font-semibold">Refer & Earn</span>
          <h1 className="mt-3 text-3xl md:text-5xl font-extrabold text-primary-foreground leading-tight">
            Give $50, Get $50 — refer a neighbor in Pinecrest + Kendall
          </h1>
          <p className="mt-5 text-lg text-primary-foreground/85 max-w-2xl mx-auto leading-relaxed">
            Send a neighbor your link. They get $50 off their first month. You
            get $50 off yours. No cap, no expiration, no fine print.
          </p>
          <div className="mt-6 inline-flex items-center gap-1.5 bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-1.5 text-primary-foreground text-sm font-medium">
            <MapPin className="w-3.5 h-3.5" />
            {SERVICE_AREA_TRUST}
          </div>
        </div>
      </section>

      <LandingTicker />

      {/* HOW IT WORKS */}
      <section className="relative bg-background py-16 px-4 overflow-hidden">
        <SectionDecor tone="primary" />
        <div className="relative max-w-5xl mx-auto">
          <Reveal className="text-center mb-10">
            <span className="text-xs uppercase tracking-widest text-primary font-semibold">How it works</span>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-3">Three steps. Two rewards.</h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { Icon: Copy, title: "Share your link", body: "Copy your unique referral link and send it to a neighbor in 33156, 33183, or 33186." },
              { Icon: UserPlus, title: "They sign up", body: "Your neighbor checks out with your link. $50 is automatically applied to their first month." },
              { Icon: Gift, title: "You both save", body: "Once their first invoice clears, $50 is credited to your next month. No cap, stack as many as you want." },
            ].map(({ Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 80}>
                <div className="bg-card border rounded-xl p-6 h-full hover-lift">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center font-bold text-sm mb-4">
                    {i + 1}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-primary" aria-hidden="true" />
                    <h3 className="text-base font-bold text-foreground">{title}</h3>
                  </div>
                  <p className="text-sm text-text-mid leading-relaxed">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* REFERRAL CODE BLOCK */}
      <section className="relative bg-section-alt py-16 px-4 overflow-hidden">
        <SectionDecor tone="gold" />
        <div className="relative max-w-2xl mx-auto">
          <Reveal>
            <div className="bg-card border rounded-2xl p-6 md:p-8 text-center shadow-sm">
              <Sparkles className="w-6 h-6 text-gold mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                {code ? "Your referral link" : "Sign in to get your link"}
              </h2>

              {!authLoaded && (
                <p className="text-sm text-text-mid mt-3">Loading…</p>
              )}

              {authLoaded && code && (
                <>
                  <p className="text-sm text-text-mid mt-2">
                    Share this link with a neighbor. They save $50, you save $50.
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
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </>
              )}

              {authLoaded && !code && (
                <>
                  <p className="text-sm text-text-mid mt-3">
                    Active customers get a unique referral link in their dashboard.
                    Log in to grab yours and start earning.
                  </p>
                  <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                      to="/login"
                      onClick={() => pushEvent("cta_click", { cta_id: "refer_login", cta_text: "Log in to get your code" })}
                      className="cta-arrow cta-press bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                    >
                      Log in to get your code <span className="arrow">→</span>
                    </Link>
                    <Link
                      to={becomeCustomerCta.to}
                      onClick={becomeCustomerCta.onClick}
                      className="cta-arrow cta-press bg-card border hover:bg-muted text-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
                    >
                      Become a customer first <span className="arrow">→</span>
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
        headline="Not a member yet? Start with a plan."
        subhead="Lock in your monthly price, then send your link to a neighbor."
        ctaLabel="Book in 60 seconds"
        trackingId="refer_final"
      />

      <Footer />
    </div>
  );
};

export default Refer;
