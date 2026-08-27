import testimonialsBg from "@/assets/testimonials-bg.jpg";
import testimonialsBgMobile from "@/assets/testimonials-bg-mobile.jpg";
import { useLanguage } from "@/contexts/LanguageContext";
import { pushEvent } from "@/lib/tracking";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import FadeIn from "./FadeIn";

interface TestimonialsProps {
  onOpenPopup: () => void;
}

const foundingCards = [
  {
    icon: "🔑",
    title: "Founding Member Pricing",
    desc: "Lock in your rate as one of our first members. Your price stays put as we grow.",
  },
  {
    icon: "📸",
    title: "Built on Accountability",
    desc: "Every visit is completed by a vetted, insured, background-checked pro — with photo verification after each service, and a named point of contact on every job.",
  },
  {
    icon: "🛡️",
    title: "Satisfaction Guaranteed",
    desc: "Not happy? We make it right within 24 hours — re-service or credit, no questions asked.",
  },
];

const Testimonials = ({ onOpenPopup }: TestimonialsProps) => {
  const { t } = useLanguage();

  const ctaText = CUSTOMER_DASHBOARD_ENABLED ? "START MY PLAN →" : "Request Early Access →";
  const btnClass =
    "mt-12 bg-gold hover:bg-gold/90 text-gold-foreground font-bold px-8 py-3.5 rounded-xl transition-all hover:scale-105 shadow-[0_0_20px_rgba(245,197,24,0.3)] animate-pulse-gold";

  return (
    <section className="relative py-20 px-4 overflow-hidden">
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
      <div className="absolute inset-0 bg-navy/75" />

      <div className="relative z-10 max-w-6xl mx-auto text-center">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("FOUNDING MEMBERS")}</span>
        <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mt-3">
          {t("Be among the first homes on autopilot.")}
        </h2>
        <p className="text-primary-foreground/80 mt-4 max-w-2xl mx-auto">
          {t(
            "Tidy is now accepting a limited group of founding members across Pinecrest, Kendall, and Kendall West. Join early and lock in founding-member pricing.",
          )}
        </p>

        <div className="grid md:grid-cols-3 gap-6 mt-12 text-left">
          {foundingCards.map((card, i) => (
            <FadeIn key={card.title} delay={i * 100}>
              <div className="bg-card rounded-xl p-8 h-full">
                <div className="text-4xl mb-4" aria-hidden="true">
                  {card.icon}
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{t(card.title)}</h3>
                <p className="text-sm text-foreground/70">{t(card.desc)}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <p className="mt-10 text-sm text-primary-foreground/80">
          {t("Licensed & Insured · Background-Checked Pros · Satisfaction Guaranteed")}
        </p>

        <p className="mt-3 text-sm text-primary-foreground/80">
          {t(
            "One free premium add-on on your first visit · First visit perfect or it's free · Only 25 founding homes per ZIP",
          )}
        </p>

        <button
          onClick={() => {
            pushEvent("cta_click", { cta_id: "testimonials", cta_text: ctaText });
            onOpenPopup();
          }}
          className={btnClass}
        >
          {t(ctaText)}
        </button>
      </div>
    </section>
  );
};

export default Testimonials;
