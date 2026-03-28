import { CalendarCheck, ShieldCheck, Sofa } from "lucide-react";
import FadeIn from "./FadeIn";

interface HowItWorksProps {
  onOpenPopup: () => void;
}

const steps = [
  {
    num: 1,
    title: "Choose Your Plan",
    desc: "Select your services and frequency. Takes 60 seconds. See pricing before you pay.",
    icon: CalendarCheck,
    gradient: "from-blue-500 to-blue-600",
  },
  {
    num: 2,
    title: "We Handle Everything",
    desc: "A licensed, insured, background-checked professional shows up on time. You receive an ETA before every visit.",
    icon: ShieldCheck,
    gradient: "from-emerald-500 to-emerald-600",
  },
  {
    num: 3,
    title: "You Never Think About It Again",
    desc: "Recurring scheduling, automatic billing, photo verification after every visit. No reminders. No rebooking. No effort.",
    icon: Sofa,
    gradient: "from-violet-500 to-violet-600",
  },
];

const HowItWorks = ({ onOpenPopup }: HowItWorksProps) => (
  <section id="how-it-works" className="bg-section-alt py-20 px-4">
    <div className="max-w-6xl mx-auto text-center">
      <FadeIn>
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Simple process</span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">Get 5–10 hours back every week</h2>
        <p className="text-text-mid mt-4 max-w-xl mx-auto">How it works — three steps, then you never think about it again.</p>
      </FadeIn>

      <div className="mt-16 grid md:grid-cols-3 gap-8 relative">
        <div className="hidden md:block absolute top-[52px] left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-primary/10 via-primary/30 to-primary/10" />

        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <FadeIn key={s.num} delay={i * 150} className="relative flex flex-col items-center">
              <div className={`w-[104px] h-[104px] rounded-2xl bg-gradient-to-br ${s.gradient} flex items-center justify-center mb-6 relative z-10 shadow-lg`}>
                <Icon className="w-12 h-12 text-white" strokeWidth={1.5} />
                <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gold text-gold-foreground text-xs font-bold flex items-center justify-center shadow">{s.num}</span>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{s.title}</h3>
              <p className="text-sm text-text-mid max-w-xs">{s.desc}</p>
            </FadeIn>
          );
        })}
      </div>

      <FadeIn delay={300}>
        <button onClick={onOpenPopup} className="mt-12 bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-8 py-3.5 rounded-xl transition-colors text-base">
          Design Your Plan →
        </button>
      </FadeIn>
    </div>
  </section>
);

export default HowItWorks;
