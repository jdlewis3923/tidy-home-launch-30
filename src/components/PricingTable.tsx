import { useState } from "react";
import { HelpCircle } from "lucide-react";
import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import { BILLED_MONTHLY, SIZE_HELPERS, SIZE_LABELS, SIZES, SIZING_FAQ, VISITS_PER_MONTH, CLEANING_BANDS, CLEANING_MONTHLY, CLEANING_PER_VISIT, cleaningAnnualCents, type CanonCadence } from "@/lib/pricing-canon";
import { FREQUENCY_FAQ } from "@/lib/frequency-faq";
import AnimatedNumber from "@/components/motion/AnimatedNumber";
import { Button } from "@/components/ui/button";
import DeepCleanCard from '@/components/DeepCleanCard';

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
  const { t, language } = useLanguage();
  const [cadence, setCadence] = useState<CanonCadence>("biweekly");
  const [yearly, setYearly] = useState(false);
  const visitCount = VISITS_PER_MONTH[cadence];
  const visitLabel = t(visitCount === 1 ? "1 visit a month" : `${visitCount} visits a month`);
  return (
    <section id="pricing" className="bg-background py-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <DeepCleanCard />
        <FadeIn>
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("Pricing")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">
            {language === 'es' ? 'Un precio según el tamaño' : 'A price for your home size'}
          </h2>
          <p className="text-text-mid mt-4 max-w-xl mx-auto">
            {t(
              "Size sets the price per visit. Every 2 weeks saves 8% per visit; weekly saves 18%. Cleaning starts at $139 a month. Prepay a year and save 10%.",
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
          <div className="mt-4 flex justify-center gap-2" role="group" aria-label={language === 'es' ? 'Pago de limpieza' : 'Cleaning payment period'}>
            {[false, true].map(value => <Button key={String(value)} variant={yearly === value ? 'default' : 'outline'} aria-pressed={yearly === value} onClick={() => setYearly(value)}>{value ? (language === 'es' ? 'Anual · ahorra 10%' : 'Yearly · save 10%') : t('Monthly')}</Button>)}
          </div>
          <div className="mt-4 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
            {CLEANING_BANDS.map(band => <div key={band.size} className="rounded-lg border bg-card p-4">
              <h3 className="font-bold text-foreground">{language === 'es' ? band.name.replace('Size', 'Tamaño').replace('Estate Plus', 'Residencia Plus').replace('Estate', 'Residencia') : band.name}</h3>
              <p className="text-xs text-muted-foreground">{language === 'es' ? band.range.replace('Up to', 'Hasta').replace('sq ft', 'pies²') : band.range}</p>
              <p className="mt-3 text-xl font-bold text-foreground">${(yearly ? cleaningAnnualCents(band.size, cadence) / 100 : CLEANING_MONTHLY[band.size][cadence]).toLocaleString(language === 'es' ? 'es-US' : 'en-US', { minimumFractionDigits: yearly ? 2 : 0, maximumFractionDigits: yearly ? 2 : 0 })}<span className="text-sm font-normal">{yearly ? (language === 'es' ? '/año' : '/year') : t('/mo')}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">${CLEANING_PER_VISIT[band.size][cadence]} {language === 'es' ? 'por visita' : 'per visit'} · {visitLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">{language === 'es' ? `Hasta ${band.baths} baños` : `Up to ${band.baths} baths`}</p>
            </div>)}
          </div>
          <div className="mt-6 overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-primary-foreground">
                  <th className="text-left px-6 py-4 font-semibold">{t("Size")}</th>
                  <th className="px-6 py-4 font-semibold">{t("House Cleaning")}</th>
                  <th className="px-6 py-4 font-semibold">{t("Lawn Care")}</th>
                  <th className="px-6 py-4 font-semibold">{t("Car Care")}<span className="block text-[11px] font-normal opacity-80">{t("per month")}</span></th>

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
              "Homes over 7,000 sq ft need a walkthrough quote. Lawns over 12,000 sq ft need a custom quote.",
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
