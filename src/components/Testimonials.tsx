import testimonialsBg from "@/assets/testimonials-bg.jpg";
import testimonialsBgMobile from "@/assets/testimonials-bg-mobile.jpg";
import { useLanguage } from "@/contexts/LanguageContext";
import { pushEvent } from "@/lib/tracking";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import { Camera, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import FoundingCounter from "./FoundingCounter";

interface TestimonialsProps {
  onOpenPopup: () => void;
}

const foundingCards = [
  {
    Icon: KeyRound,
    title: "Founding Member Pricing",
    desc: "Lock in your rate as one of our first members. Your founding price is locked for 12 months.",
  },
  {
    Icon: Camera,
    title: "Built on Accountability",
    desc: "The same pro for each service, every visit — with photo verification submitted after the service.",
  },
  {
    Icon: ShieldCheck,
    title: "The 48-hour guarantee",
    desc: "If anything about your visit isn't right, tell us within 48 hours and we'll send your pro back to fix it at no charge. No forms, no argument.",
  },
];

const Testimonials = ({ onOpenPopup }: TestimonialsProps) => {
  const { t } = useLanguage();

  const ctaText = CUSTOMER_DASHBOARD_ENABLED ? "See your price — 60 seconds →" : "Request Early Access →";

  return (
    <section className="founding-showcase relative overflow-hidden">
      <img
        src={testimonialsBgMobile}
        alt="Luxury Miami home"
        loading="lazy"
        width={1080}
        height={1920}
        className="absolute inset-0 w-full h-full object-cover md:hidden"
      />
      <img
        src={testimonialsBg}
        alt="Luxury home interior"
        loading="lazy"
        width={1920}
        height={1080}
        className="absolute inset-0 w-full h-full object-cover hidden md:block"
      />
      <div className="founding-showcase-scrim absolute inset-0" />

      <div className="founding-showcase-inner relative z-10 mx-auto text-center">
        <span className="founding-showcase-eyebrow">{t("FOUNDING MEMBERS")}</span>
        <h2 className="founding-showcase-title">
          {t("Be among the first homes on autopilot.")}
        </h2>
        <p className="founding-showcase-intro">
          {t(
            "Tidy is now accepting a limited group of founding members across Pinecrest, Kendall, and Kendall West. Join early and your founding rate is locked for 12 months — it does not rise when the founding group closes.",
          )}
        </p>

        <div className="founding-showcase-panel text-left">
          {foundingCards.map(({ Icon, title, desc }) => (
              <div className="founding-showcase-benefit" key={title}>
                <span className="founding-showcase-icon"><Icon aria-hidden="true" /></span>
                <div>
                  <h3>{t(title)}</h3>
                  <p>{t(desc)}</p>
                </div>
              </div>
          ))}
        </div>

        <p className="founding-showcase-proof">
          {t("Background-Checked · Photo-Verified Visits · 48-hour guarantee")}
        </p>

        <p className="founding-showcase-proof founding-showcase-proof-secondary">
          {t(
            "One free premium add-on on your first visit · 48-hour guarantee · Only 25 founding homes per ZIP",
          )}
        </p>

        <Button
          onClick={() => {
            pushEvent("cta_click", { cta_id: "testimonials", cta_text: ctaText });
            onOpenPopup();
          }}
          className="founding-showcase-cta animate-pulse-gold"
        >
          {t(ctaText)}
        </Button>
        <div className="mt-4"><FoundingCounter tone="dark" /></div>
      </div>
    </section>
  );
};

export default Testimonials;
