import { useLanguage } from "@/contexts/LanguageContext";

const signals = [
  "Vetted & Insured",
  "Background-Checked Pros",
  "Satisfaction Guaranteed",
  "Serving Kendall + Pinecrest",
];

const ProofBar = () => {
  const { t } = useLanguage();
  return (
    <section className="bg-navy py-8">
      <div className="max-w-6xl mx-auto flex flex-wrap justify-center gap-8 md:gap-0 md:justify-between px-4">
        {signals.map((label) => (
          <div key={label} className="text-center px-4 md:px-8">
            <div className="text-base md:text-lg font-extrabold text-primary-foreground tracking-wide">
              {t(label)}
            </div>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-primary-foreground/40 mt-4 tracking-wide">
        {t("Consistent service. No follow-ups. No hassle.")}
      </p>
    </section>
  );
};

export default ProofBar;
