import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";
import { VETTED_CLAIM } from "@/lib/pricing-canon";
import { CalendarDays, CreditCard, MapPin, RefreshCw, ShieldCheck, SquareCheckBig } from "lucide-react";

const reasons = [
  {
    Icon: RefreshCw,
    title: "Full Autopilot",
    desc: "Everything runs automatically. No scheduling. No coordination. No thinking about it again after signup.",
  },
  {
    Icon: SquareCheckBig,
    title: "The 48-hour guarantee",
    desc: "If anything about your visit isn't right, tell us within 48 hours and we'll send your pro back to fix it at no charge. No forms, no argument.",
  },
  {
    Icon: ShieldCheck,
    title: VETTED_CLAIM,
    desc: "Every professional is screened through Checkr before their first visit. Photo verification submitted after every visit.",
  },
  {
    Icon: CalendarDays,
    title: "Always on Schedule",
    desc: "Weekly, biweekly, or monthly service. No delays, no chasing vendors, no rescheduling headaches.",
  },
  {
    Icon: CreditCard,
    title: "One Simple Bill",
    desc: "All services under one monthly subscription. Transparent pricing, no surprise charges, secure payments via Stripe.",
  },
  {
    Icon: MapPin,
    title: "Local to Your ZIP",
    desc: "Built for South Florida homes. Serving Pinecrest, Kendall, and Kendall West — 33156, 33183, 33186.",
  },
];

const WhyTidy = () => {
  const { t } = useLanguage();
  return (
    <section className="why-tidy-showcase overflow-hidden">
      <div className="why-tidy-showcase-inner mx-auto text-center">
        <FadeIn>
          <span className="why-tidy-eyebrow">{t("Why Tidy")}</span>
          <h2 className="why-tidy-title">
            {t("Why homeowners choose Tidy")}
          </h2>
        </FadeIn>

        <div className="why-tidy-grid">
          {reasons.map(({ Icon, title, desc }, i) => (
            <FadeIn key={title} delay={i * 100}>
              <div className="why-tidy-item text-left">
                <span className="why-tidy-icon"><Icon aria-hidden="true" /></span>
                <div>
                  <h3>{t(title)}</h3>
                  <p>{t(desc)}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyTidy;
