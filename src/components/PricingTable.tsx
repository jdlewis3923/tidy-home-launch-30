import { HelpCircle } from "lucide-react";
import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import { SIZE_HELPERS, SIZE_LABELS, SIZE_PRICES, SIZES, SIZING_FAQ } from "@/lib/pricing-canon";

const rows = SIZES.map((size) => ({
  size,
  cleaning: {
    label: SIZE_LABELS.cleaning[size],
    helper: SIZE_HELPERS.cleaning[size],
    price: `$${SIZE_PRICES.cleaning[size]}`,
  },
  lawn: {
    label: SIZE_LABELS.lawn[size],
    helper: SIZE_HELPERS.lawn[size],
    price: `$${SIZE_PRICES.lawn[size]}`,
  },
  detailing: {
    label: SIZE_LABELS.detailing[size],
    helper: SIZE_HELPERS.detailing[size],
    price: `$${SIZE_PRICES.detailing[size]}`,
  },
}));

const PricingTable = () => {
  const { t } = useLanguage();
  return (
    <section id="pricing" className="bg-background py-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <FadeIn>
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("Pricing")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">
            {t("three sizes, one price each")}
          </h2>
          <p className="text-text-mid mt-4 max-w-xl mx-auto">
            {t(
              "Cleaning and lawn care are priced per visit, so coming more often costs more only because we come more often. Shine Complete is a flat monthly price.",
            )}
          </p>
        </FadeIn>

        <FadeIn delay={200}>
          <div className="mt-12 overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-primary-foreground">
                  <th className="text-left px-6 py-4 font-semibold">{t("Size")}</th>
                  <th className="px-6 py-4 font-semibold">{t("House Cleaning")}<span className="block text-[11px] font-normal opacity-80">{t("per visit")}</span></th>
                  <th className="px-6 py-4 font-semibold">{t("Lawn Care")}<span className="block text-[11px] font-normal opacity-80">{t("per visit")}</span></th>
                  <th className="px-6 py-4 font-semibold">{t("Shine Complete")}<span className="block text-[11px] font-normal opacity-80">{t("per month")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.size}
                    className={`${i % 2 === 0 ? "bg-background" : "bg-section-alt"} border-t transition-colors duration-200 hover:bg-primary/5`}
                  >
                    <td className="text-left px-6 py-4 text-foreground">
                      <span className="font-semibold block">{r.size}</span>
                    </td>
                    <td className="px-6 py-4 text-foreground/80">
                      <span className="font-semibold block">{r.cleaning.price}</span>
                      <span className="text-xs text-text-light">{t(r.cleaning.label)} · {t(r.cleaning.helper)}</span>
                    </td>
                    <td className="px-6 py-4 text-foreground/80">
                      <span className="font-semibold block">{r.lawn.price}</span>
                      <span className="text-xs text-text-light">{t(r.lawn.label)} · {t(r.lawn.helper)}</span>
                    </td>
                    <td className="px-6 py-4 text-foreground/80">
                      <span className="font-semibold block">{r.detailing.price}</span>
                      <span className="text-xs text-text-light">{t(r.detailing.label)} · {t(r.detailing.helper)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-xs text-text-light">
            {t(
              "5+ bedroom homes and yards over 10,000 sq ft are quoted by hand. Cancel anytime.",
            )}
          </p>
          <p className="mt-2 text-xs text-text-light/80">
            {t(
              "Add a second service and one monthly car wash is on us; add a third and two are. Add-ons — ovens, hedges, pet hair and the like — are priced separately.",
            )}
          </p>
        </FadeIn>

        {/* Sizing questions — only when the dashboard is on */}
        {CUSTOMER_DASHBOARD_ENABLED && (
          <FadeIn delay={300}>
            <div className="mt-14 grid sm:grid-cols-2 gap-4 text-left">
              {SIZING_FAQ.map((item) => (
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
