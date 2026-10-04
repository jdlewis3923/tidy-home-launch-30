import { useState } from "react";
import { HelpCircle } from "lucide-react";
import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import { BILLED_MONTHLY, SIZE_HELPERS, SIZE_LABELS, SIZES, SIZING_FAQ, VISITS_PER_MONTH, type CanonCadence } from "@/lib/pricing-canon";
import { FREQUENCY_FAQ } from "@/lib/frequency-faq";
import AnimatedNumber from "@/components/motion/AnimatedNumber";
import { Button } from "@/components/ui/button";

const cadenceOptions: { value: CanonCadence; label: string }[] = [
  { value: "monthly", label: "Once a month" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "weekly", label: "Weekly" },
];

const rows = SIZES.map((size) => ({
  size,
  cleaning: {
    label: SIZE_LABELS.cleaning[size],
    helper: SIZE_HELPERS.cleaning[size],
  },
  lawn: {
    label: SIZE_LABELS.lawn[size],
    helper: SIZE_HELPERS.lawn[size],
  },
  detailing: {
    label: SIZE_LABELS.detailing[size],
    helper: SIZE_HELPERS.detailing[size],
  },
}));

const PricingTable = () => {
  const { t } = useLanguage();
  const [cadence, setCadence] = useState<CanonCadence>("biweekly");
  const visitCount = VISITS_PER_MONTH[cadence];
  const visitLabel = t(visitCount === 1 ? "1 visit a month" : `${visitCount} visits a month`);
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
              "Size sets the price per visit for cleaning and lawn care. Coming more often lowers the price per visit — biweekly is 8% less per visit than monthly, weekly is 18% less. You are always billed monthly. Shine Complete is one flat monthly price.",
            )}
          </p>

        </FadeIn>

        <FadeIn delay={200}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2" role="group" aria-label={t("How often should we come?")}>
            {cadenceOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={cadence === option.value ? "default" : "outline"}
                aria-pressed={cadence === option.value}
                onClick={() => setCadence(option.value)}
                className="rounded-full"
              >
                {t(option.label)}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">{t("How often should we come?")}</p>
          <div className="mt-6 overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-primary-foreground">
                  <th className="text-left px-6 py-4 font-semibold">{t("Size")}</th>
                  <th className="px-6 py-4 font-semibold">{t("House Cleaning")}</th>
                  <th className="px-6 py-4 font-semibold">{t("Lawn Care")}</th>
                  <th className="px-6 py-4 font-semibold">{t("Car Care · Shine Complete")}<span className="block text-[11px] font-normal opacity-80">{t("per month")}</span></th>

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
                      <span className="font-semibold block"><AnimatedNumber value={BILLED_MONTHLY.cleaning[r.size][cadence]} duration={400} format={(n) => `$${Math.round(n)}`} />/mo</span>
                      <span className="block text-xs text-muted-foreground">{visitLabel}</span>
                      <span className="text-xs text-text-light">{t(r.cleaning.label)} · {t(r.cleaning.helper)}</span>
                    </td>
                    <td className="px-6 py-4 text-foreground/80">
                      <span className="font-semibold block"><AnimatedNumber value={BILLED_MONTHLY.lawn[r.size][cadence]} duration={400} format={(n) => `$${Math.round(n)}`} />/mo</span>
                      <span className="block text-xs text-muted-foreground">{visitLabel}</span>
                      <span className="text-xs text-text-light">{t(r.lawn.label)} · {t(r.lawn.helper)}</span>
                    </td>
                    <td className="px-6 py-4 text-foreground/80">
                      <span className="font-semibold block">${BILLED_MONTHLY.detailing[r.size].monthly}/mo</span>
                      <span className="block text-xs text-muted-foreground">{t("3 washes a month + 2 full details a year")}</span>
                      <span className="text-xs text-text-light">{t(r.detailing.label)}</span>
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
              "Add a 2nd service and you pick one free premium add-on every month. Add-ons — ovens, bed edges, pet hair and the like — are priced separately.",
            )}
          </p>
        </FadeIn>

        {/* Sizing questions — only when the dashboard is on */}
        {CUSTOMER_DASHBOARD_ENABLED && (
          <FadeIn delay={300}>
            <div className="mt-14 grid sm:grid-cols-2 gap-4 text-left">
              {[FREQUENCY_FAQ, ...SIZING_FAQ].map((item) => (
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
