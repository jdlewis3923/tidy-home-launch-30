import stepChoose from "@/assets/step-choose-plan.png";
import stepHandle from "@/assets/step-handle.png";
import stepRelax from "@/assets/step-relax.png";

interface HowItWorksProps {
  onOpenPopup: () => void;
}

const steps = [
  {
    num: 1,
    title: "Choose Your Plan",
    desc: "Select your services and frequency. Takes 60 seconds. See pricing before you pay.",
    image: stepChoose,
  },
  {
    num: 2,
    title: "We Handle Everything",
    desc: "A licensed, insured, background-checked professional shows up on time. You receive an ETA before every visit.",
    image: stepHandle,
  },
  {
    num: 3,
    title: "You Never Think About It Again",
    desc: "Recurring scheduling, automatic billing, photo verification after every visit. No reminders. No rebooking. No effort.",
    image: stepRelax,
  },
];

const HowItWorks = ({ onOpenPopup }: HowItWorksProps) => (
  <section id="how-it-works" className="bg-section-alt py-20 px-4">
    <div className="max-w-6xl mx-auto text-center">
      <span className="text-xs uppercase tracking-widest text-primary font-semibold">Simple process</span>
      <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">Get 5–10 hours back every week</h2>
      <p className="text-text-mid mt-4 max-w-xl mx-auto">How it works — three steps, then you never think about it again.</p>

      <div className="mt-16 grid md:grid-cols-3 gap-8 relative">
        {/* Connecting line on desktop */}
        <div className="hidden md:block absolute top-16 left-1/6 right-1/6 h-0.5 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20" />

        {steps.map((s) => (
          <div key={s.num} className="relative flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-deep flex items-center justify-center text-primary-foreground font-bold text-lg mb-6 relative z-10">
              {s.num}
            </div>
            <img src={s.image} alt={s.title} loading="lazy" className="w-40 h-40 object-contain mb-6" />
            <h3 className="text-lg font-bold text-foreground mb-2">{s.title}</h3>
            <p className="text-sm text-text-mid max-w-xs">{s.desc}</p>
          </div>
        ))}
      </div>

      <button onClick={onOpenPopup} className="mt-12 bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-8 py-3.5 rounded-xl transition-colors text-base">
        Design Your Plan →
      </button>
    </div>
  </section>
);

export default HowItWorks;
