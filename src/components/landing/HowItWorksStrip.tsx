import { Calendar, Truck, Settings } from "lucide-react";
import Reveal from "./Reveal";
import { useLanguage } from "@/contexts/LanguageContext";

interface Step {
  title: string;
  body: string;
}

interface Props {
  /** Service-specific phrasing (e.g. "Pick your plan", "We show up", "Set it and forget it") */
  steps?: Step[];
}

const DEFAULT_STEPS: Step[] = [
  { title: "Pick your plan", body: "Choose cadence. Lock your price." },
  { title: "We show up", body: "Same crew every visit. ETA reminder 30 min before." },
  { title: "Set it and forget it", body: "Pause, skip, or cancel anytime from your dashboard." },
];

const ICONS = [Calendar, Truck, Settings];

const HowItWorksStrip = ({ steps = DEFAULT_STEPS }: Props) => {
  const { t } = useLanguage();
  return (
    <section className="bg-background py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <Reveal className="text-left mb-10">
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("How It Works")}</span>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-3">{t("Three steps. Then never think about it.")}</h2>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s, i) => {
            const Icon = ICONS[i] ?? Calendar;
            return (
              <Reveal key={s.title} delay={i * 80}>
                <div className="text-center md:text-left flex md:block items-start gap-4">
                  <div className="shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center font-bold text-base shadow-sm md:mb-4">
                    {i + 1}
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2">
                      <Icon className="w-4 h-4 text-primary md:hidden" aria-hidden="true" />
                      <h3 className="text-base md:text-lg font-bold text-foreground">{t(s.title)}</h3>
                    </div>
                    <p className="text-sm text-text-mid mt-1.5 leading-relaxed">{t(s.body)}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksStrip;
