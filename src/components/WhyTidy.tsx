const reasons = [
  { icon: "🔁", title: "Full Autopilot", desc: "Everything runs automatically. No scheduling. No coordination. No thinking about it again after signup." },
  { icon: "✅", title: "Satisfaction Guarantee", desc: "If it isn't perfect, we fix it fast. No contracts. Cancel anytime. We stand behind every visit." },
  { icon: "🛡️", title: "Licensed & Insured", desc: "Every professional is background-checked and fully insured. Photo verification submitted after every visit." },
  { icon: "📅", title: "Always on Schedule", desc: "Weekly, biweekly, or monthly service. No delays, no chasing vendors, no rescheduling headaches." },
  { icon: "💳", title: "One Simple Bill", desc: "All services under one monthly subscription. Transparent pricing, no surprise charges, secure payments via Stripe." },
  { icon: "📍", title: "Miami-Local", desc: "Built for Florida homes. Serving Kendall, Pinecrest, Coral Gables, South Miami, Doral & surrounding neighborhoods." },
];

const WhyTidy = () => (
  <section className="bg-section-alt py-20 px-4">
    <div className="max-w-6xl mx-auto text-center">
      <span className="text-xs uppercase tracking-widest text-primary font-semibold">Why Tidy</span>
      <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-12">Why homeowners choose Tidy</h2>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reasons.map((r) => (
          <div key={r.title} className="bg-card border rounded-xl p-6 text-left hover-lift">
            <span className="text-2xl">{r.icon}</span>
            <h3 className="text-base font-bold text-foreground mt-3 mb-2">{r.title}</h3>
            <p className="text-sm text-text-mid">{r.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default WhyTidy;
