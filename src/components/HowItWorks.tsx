import { CalendarCheck, ShieldCheck, ClipboardList } from "lucide-react";
import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";
import { pushEvent } from "@/lib/tracking";

interface HowItWorksProps {
  onOpenPopup: () => void;
}

// Three steps carry the weight the hero subhead no longer does.
// Step 3 is the guarantee — it gets the gold treatment.
const steps = [
  {
    num: 1,
    title: "Pick your services and how often",
    desc: "Cleaning, lawn, car care — any one, any two, or all three.",
    icon: ClipboardList,
    gradient: "from-blue-500 to-blue-600",
  },
  {
    num: 2,
    title: "We confirm your day and your Pro",
    desc: "Same person every visit. Background-checked and insured.",
    icon: CalendarCheck,
    gradient: "from-sky-500 to-sky-600",
  },
  {
    num: 3,
    title: "That's it",
    desc: "Photo-verified every visit. Not right? We come back within 48 hours, free.",
    icon: ShieldCheck,
    gradient: "from-gold to-amber-500",
    highlight: true,
  },
];

const HowItWorks = ({ onOpenPopup }: HowItWorksProps) => {
  const { t } = useLanguage();

  return (
    <section id="how-it-works" className="bg-section-alt py-20 px-4">
      <div className="max-w-6xl mx-auto text-left">
        <FadeIn>
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("Simple process")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{t("Get 5–10 hours back every week")}</h2>
          <p className="text-text-mid mt-4 max-w-xl">{t("Three steps — then your home runs on autopilot.")}</p>
        </FadeIn>

        <div className="mt-16 grid md:grid-cols-3 gap-6 relative">
          <div className="hidden md:block absolute top-[52px] left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-primary/10 via-primary/30 to-primary/10" />

          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <FadeIn key={s.num} delay={i * 100} className="relative flex flex-col items-start text-left">
                <div
                  className={`${
                    s.highlight ? "rounded-2xl border border-gold/40 bg-gold/5 p-5 -m-1" : ""
                  } w-full h-full`}
                >
                  <div
                    className={`w-[104px] h-[104px] rounded-2xl bg-gradient-to-br ${s.gradient} flex items-center justify-center mb-5 relative z-10 shadow-lg`}
                  >
                    <Icon className="w-12 h-12 text-white" strokeWidth={1.5} />
                    <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gold text-gold-foreground font-bold flex items-center justify-center text-xs shadow">
                      {s.num}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-1.5">{t(s.title)}</h3>
                  <p className={`text-sm ${s.highlight ? "text-foreground font-medium" : "text-text-mid"} max-w-xs`}>
                    {t(s.desc)}
                  </p>
                  {s.highlight && (
                    <span className="mt-4 inline-flex items-center rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold-foreground">
                      {t("Our 48-hour guarantee")}
                    </span>
                  )}
                </div>
              </FadeIn>
            );
          })}
        </div>

        <FadeIn delay={500}>
          <button id="cta-how-it-works" data-track="cta_how_it_works" onClick={() => { pushEvent("cta_click", { cta_id: "how_it_works", cta_text: "See your price — 60 seconds" }); onOpenPopup(); }} className="mt-12 bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-8 py-3.5 rounded-xl transition-colors text-base">
            {t("See your price — 60 seconds →")}
          </button>
        </FadeIn>
      </div>
    </section>
  );
};

export default HowItWorks;
