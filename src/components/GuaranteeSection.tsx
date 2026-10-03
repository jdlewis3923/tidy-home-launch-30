import { ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/** Home page: the 48-hour guarantee in full, directly under the services. */
const GuaranteeSection = () => {
  const { t } = useLanguage();
  return (
    <section id="guarantee" className="bg-background py-14 px-4">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm">
        <ShieldCheck className="h-10 w-10 text-primary" strokeWidth={1.75} aria-hidden />
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">{t("The 48-hour guarantee")}</h2>
        <p className="max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
          {t(
            "If anything about your visit isn't right, tell us within 48 hours and we'll send your pro back to fix it at no charge. No forms, no argument.",
          )}
        </p>
      </div>
    </section>
  );
};

export default GuaranteeSection;
