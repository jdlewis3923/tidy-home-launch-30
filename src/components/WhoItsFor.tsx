import FadeIn from "./FadeIn";

const personas = [
  {
    icon: "💼",
    title: "Busy Professionals",
    desc: "No time to manage 3 different vendors. One plan handles everything on autopilot while you focus on what matters.",
  },
  {
    icon: "🏡",
    title: "Families",
    desc: "Keep your home consistently maintained without it falling on any one person. Reliable service, every single visit.",
  },
  {
    icon: "⏱️",
    title: "Time-Conscious Homeowners",
    desc: "You value your weekend. Stop spending it coordinating, rebooking, and following up. Tidy handles all of it.",
  },
];

const WhoItsFor = () => (
  <section className="bg-section-alt py-20 px-4">
    <div className="max-w-5xl mx-auto text-center">
      <FadeIn>
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Who it's for</span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">Built for homeowners who want it handled.</h2>
        <p className="text-muted-foreground mt-4 max-w-xl mx-auto">If you'd rather spend your weekend doing anything but managing vendors, Tidy is for you.</p>
      </FadeIn>

      <div className="grid md:grid-cols-3 gap-6 mt-12">
        {personas.map((p, i) => (
          <FadeIn key={p.title} delay={i * 150} direction={i === 0 ? "left" : i === 2 ? "right" : "up"} scale>
            <div className="bg-card border rounded-xl p-8 text-left hover-lift h-full transition-all duration-300">
              <span className="text-3xl">{p.icon}</span>
              <h3 className="text-lg font-bold text-foreground mt-4 mb-2">{p.title}</h3>
              <p className="text-sm text-text-mid">{p.desc}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  </section>
);

export default WhoItsFor;
