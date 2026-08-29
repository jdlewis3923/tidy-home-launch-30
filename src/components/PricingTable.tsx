import { HelpCircle } from "lucide-react";
import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import { BAND_PRICES, BANDS } from "@/lib/pricing-canon";

const visit = (v: number) => `$${v}`;

const bandHeadings: Record<(typeof BANDS)[number], { name: string; home: string; lot: string; car: string }> = {
  compact: { name: "Compact", home: "up to 2 bed / 2 bath", lot: "under ¼ acre", car: "coupe, sedan, hatchback" },
  standard: { name: "Standard", home: "3 bed / 2 bath", lot: "¼–½ acre", car: "crossover, 2-row SUV" },
  large: { name: "Large", home: "4 bed / 3 bath", lot: "½–¾ acre", car: "3-row SUV, pickup, minivan" },
  estate: { name: "Estate", home: "5+ bed / 4+ bath", lot: "¾–1 acre", car: "full-size SUV, dually, 8-seat" },
};

const rows = BANDS.map((band) => ({
  band,
  ...bandHeadings[band],
  cleaning: visit(BAND_PRICES.cleaning[band]),
  lawn: visit(BAND_PRICES.lawn[band]),
  detailing: visit(BAND_PRICES.detailing[band]),
}));

const pricingFAQ = [
  {
    q: "What sets my price?",
    a: "The size of your home or lot, nothing else. Four bands, one flat price per visit. Come monthly, biweekly or weekly — the price per visit stays the same.",
  },
  {
    q: "How do bundle discounts work?",
    a: "Pick 2 services and get 10% off. Pick all 3 and get 15% off. Applied at checkout — no code needed.",
  },
  {
    q: "How do you know my band?",
    a: "You tell us your bedrooms and bathrooms, your lot size, or what you drive. We check it against the county property record. If we got it wrong, we correct it — down straight away and refunded, up only from your second visit and after we tell you.",
  },
  {
    q: "Can I change my plan later?",
    a: "Yes. Add or drop a service, change how often we come, or pause. Changes take effect on your next billing cycle.",
  },
];

const PricingTable = () => {
  const { t } = useLanguage();
  return (
    <section id="pricing" className="bg-background py-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <FadeIn>
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("Pricing")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">
            {t("One price per visit, set by size.")}
          </h2>
          <p className="text-text-mid mt-4 max-w-xl mx-auto">
            {t(
              "One price per visit, set by the size of your home or lot. Come as often as you like — monthly, biweekly or weekly — the price per visit stays the same.",
            )}
          </p>
        </FadeIn>

        <FadeIn delay={200}>
          <div className="mt-12 overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-primary-foreground">
                  <th className="text-left px-6 py-4 font-semibold">{t("Size")}</th>
                  <th className="px-6 py-4 font-semibold">{t("🏠 House Cleaning")}</th>
                  <th className="px-6 py-4 font-semibold">{t("🌿 Lawn Care")}</th>
                  <th className="px-6 py-4 font-semibold">{t("🚗 Car Detailing")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.band}
                    className={`${i % 2 === 0 ? "bg-background" : "bg-section-alt"} border-t transition-colors duration-200 hover:bg-primary/5`}
                  >
                    <td className="text-left px-6 py-4 text-foreground">
                      <span className="font-semibold block">{t(r.name)}</span>
                      <span className="text-xs text-text-light">
                        {t(r.home)} · {t(r.lot)} · {t(r.car)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-foreground/80">{r.cleaning}</td>
                    <td className="px-6 py-4 text-foreground/80">{r.lawn}</td>
                    <td className="px-6 py-4 text-foreground/80">{r.detailing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-xs text-text-light">
            {t(
              "Prices are per visit · Bundle discount auto-applied at checkout · 2 services = 10% off · 3 services = 15% off · Cancel anytime",
            )}
          </p>
          <p className="mt-2 text-xs text-text-light/80">
            {t(
              "Corner lots move up one band. Above the Estate band we quote by hand. Add-ons — ovens, hedges, pet hair and the like — are priced separately.",
            )}
          </p>
        </FadeIn>

        {/* Pricing clarity section - only when dashboard ON */}
        {CUSTOMER_DASHBOARD_ENABLED && (
          <FadeIn delay={300}>
            <div className="mt-14 grid sm:grid-cols-2 gap-4 text-left">
              {pricingFAQ.map((item) => (
                <div key={item.q} className="bg-card border rounded-xl p-5">
                  <div className="flex items-start gap-2 mb-2">
                    <HelpCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <h4 className="text-sm font-semibold text-foreground">{t(item.q)}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">{t(item.a)}</p>
                </div>
              ))}
            </div>
          </FadeIn>
        )}
      </div>
    </section>
  );
};

export default PricingTable;
