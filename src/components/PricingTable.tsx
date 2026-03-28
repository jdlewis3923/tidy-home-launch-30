import FadeIn from "./FadeIn";

const rows = [
  { service: "🏠 House Cleaning", monthly: "$159/mo", biweekly: "$275/mo", weekly: "$459/mo" },
  { service: "🌿 Lawn Care", monthly: "$85/mo", biweekly: "$129/mo", weekly: "$195/mo" },
  { service: "🚗 Car Detailing", monthly: "$159/mo", biweekly: "$249/mo", weekly: "—" },
  { service: "🔧 Cleaning Add-Ons", monthly: "$40–$95", biweekly: "one-time", weekly: "—" },
  { service: "🔧 Detailing Add-Ons", monthly: "$60–$90", biweekly: "one-time", weekly: "—" },
  { service: "🔧 Lawn Add-Ons", monthly: "$55–$80", biweekly: "one-time", weekly: "—" },
];

const PricingTable = () => (
  <section id="pricing" className="bg-background py-20 px-4">
    <div className="max-w-4xl mx-auto text-center">
      <FadeIn>
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Pricing</span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">Simple, transparent rates. No surprises.</h2>
        <p className="text-text-mid mt-4 max-w-xl mx-auto">
          Pay monthly. Cancel anytime. Higher frequency = lower cost per visit. Bundle 2+ services for automatic discounts.
        </p>
      </FadeIn>

      <FadeIn delay={200}>
        <div className="mt-12 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy text-primary-foreground">
                <th className="text-left px-6 py-4 font-semibold">Service</th>
                <th className="px-6 py-4 font-semibold">Monthly</th>
                <th className="px-6 py-4 font-semibold">Biweekly</th>
                <th className="px-6 py-4 font-semibold">Weekly</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.service} className={`${i % 2 === 0 ? "bg-background" : "bg-section-alt"} border-t`}>
                  <td className="text-left px-6 py-4 font-medium text-foreground">{r.service}</td>
                  <td className="px-6 py-4 text-foreground/80">{r.monthly}</td>
                  <td className="px-6 py-4 text-foreground/80">{r.biweekly}</td>
                  <td className="px-6 py-4 text-foreground/80">{r.weekly}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-xs text-text-light">
          Bundle discount auto-applied at checkout · 2 services = 15% off · 3 services = 20% off · Cancel anytime
        </p>
      </FadeIn>
    </div>
  </section>
);

export default PricingTable;
