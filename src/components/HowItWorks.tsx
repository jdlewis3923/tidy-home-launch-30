import { CalendarCheck, ShieldCheck, Sofa, ClipboardList, LayoutDashboard } from "lucide-react";
import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";
import { pushEvent } from "@/lib/tracking";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";

interface HowItWorksProps {
  onOpenPopup: () => void;
}

const steps = [
  {
    num: 1,
    title: "Choose Your Services",
    desc: "Pick house cleaning, lawn care, car detailing — or all three. Select your preferred frequency for each.",
    icon: ClipboardList,
    gradient: "from-blue-500 to-blue-600",
  },
  {
    num: 2,
    title: "Set Up Your Plan",
    desc: "Tell us about your home, choose your schedule, and review your price. Takes under 2 minutes.",
    icon: CalendarCheck,
    gradient: "from-sky-500 to-sky-600",
  },
  {
    num: 3,
    title: "Tidy Confirms & Coordinates",
    desc: "We assign a vetted, insured professional and lock in your recurring schedule. You'll get a confirmation with your first visit date.",
    icon: ShieldCheck,
    gradient: "from-emerald-500 to-emerald-600",
  },
  {
    num: 4,
    title: "Your Pro Completes the Visit",
    desc: "Your professional arrives on schedule, completes the service, and submits photo verification when done.",
    icon: Sofa,
    gradient: "from-violet-500 to-violet-600",
  },
  {
    num: 5,
    title: "Manage Everything from Your Dashboard",
    desc: "Adjust services, skip visits, update your plan, or pause anytime — all from one simple dashboard.",
    icon: LayoutDashboard,
    gradient: "from-amber-500 to-amber-600",
  },
];

const HowItWorks = ({ onOpenPopup }: HowItWorksProps) => {
  const { t } = useLanguage();
  return (
    <section id="how-it-works" className="bg-section-alt py-20 px-4">
      <div className="max-w-6xl mx-auto text-center">
        <FadeIn>
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("Simple process")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{t("Get 5–10 hours back every week")}</h2>
          <p className="text-text-mid mt-4 max-w-xl mx-auto">{t("Five simple steps — then your home runs on autopilot.")}</p>
        </FadeIn>

        <div className="mt-16 grid md:grid-cols-5 gap-6 relative">
          <div className="hidden md:block absolute top-[52px] left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-primary/10 via-primary/30 to-primary/10" />

          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <FadeIn key={s.num} delay={i * 100} className="relative flex flex-col items-center">
                <div className={`w-[88px] h-[88px] rounded-2xl bg-gradient-to-br ${s.gradient} flex items-center justify-center mb-5 relative z-10 shadow-lg`}>
                  <Icon className="w-10 h-10 text-white" strokeWidth={1.5} />
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gold text-gold-foreground text-[10px] font-bold flex items-center justify-center shadow">{s.num}</span>
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1.5">{t(s.title)}</h3>
                <p className="text-xs text-text-mid max-w-[180px]">{t(s.desc)}</p>
              </FadeIn>
            );
          })}
        </div>

        <FadeIn delay={500}>
          <button id="cta-how-it-works" data-track="cta_how_it_works" onClick={() => { pushEvent("cta_click", { cta_id: "how_it_works", cta_text: CUSTOMER_DASHBOARD_ENABLED ? "START MY PLAN" : "Design Your Plan" }); onOpenPopup(); }} className="mt-12 bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-8 py-3.5 rounded-xl transition-colors text-base">
            {t(CUSTOMER_DASHBOARD_ENABLED ? "START MY PLAN →" : "Design Your Plan →")}
          </button>
        </FadeIn>
      </div>
    </section>
  );
};

export default HowItWorks;
