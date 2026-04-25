import { MapPin } from "lucide-react";
import Reveal from "./Reveal";
import { useLanguage } from "@/contexts/LanguageContext";

const ZIPS = [
  { zip: "33156", name: "Pinecrest" },
  { zip: "33183", name: "Kendall" },
  { zip: "33186", name: "Kendall West" },
];

const NeighborhoodTrust = () => {
  const { t } = useLanguage();
  return (
    <section className="bg-section-alt py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Reveal className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            {t("Built for Pinecrest + Kendall.")}
          </h2>
          <p className="text-sm md:text-base text-text-mid mt-3 max-w-2xl mx-auto leading-relaxed">
            {t("We serve only 33156, 33183, and 33186 — so your crew is local, on-time, and never stuck in traffic.")}
          </p>
        </Reveal>

        <div className="grid grid-cols-3 gap-3 md:gap-6">
          {ZIPS.map((z, i) => (
            <Reveal key={z.zip} delay={i * 80}>
              <div className="bg-card border rounded-xl p-4 md:p-6 text-center hover-lift">
                <MapPin className="w-5 h-5 md:w-6 md:h-6 text-primary mx-auto mb-2" aria-hidden="true" />
                <p className="text-base md:text-lg font-bold text-foreground">{z.zip}</p>
                <p className="text-xs md:text-sm text-text-mid mt-1">{t(z.name)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default NeighborhoodTrust;
