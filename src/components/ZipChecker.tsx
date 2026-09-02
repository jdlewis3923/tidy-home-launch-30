import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import WaitlistCapture from "@/components/dashboard/WaitlistCapture";
import { loadState, saveState } from "@/lib/dashboard-pricing";

const zipData: Record<string, string> = {
  "33183": "Kendall",
  "33186": "Kendall West",
  "33156": "Pinecrest",
};

interface ZipCheckerProps {
  /** Same handler the other homepage See your price — 60 seconds buttons use. */
  onStart?: () => void;
}

const ZipChecker = ({ onStart }: ZipCheckerProps) => {
  const [zip, setZip] = useState("");
  const [result, setResult] = useState<{ found: boolean; name?: string; zip?: string } | null>(null);
  const { t } = useLanguage();

  const handleCheck = () => {
    const trimmed = zip.trim();
    if (zipData[trimmed]) {
      setResult({ found: true, name: zipData[trimmed], zip: trimmed });
    } else {
      setResult({ found: false, zip: trimmed });
    }
  };

  return (
    <section className="bg-navy py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_hsl(217_91%_60%_/_0.15),_transparent_70%)]" />

      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">{t("Is Tidy in your neighborhood?")}</h2>
        <p className="text-primary-foreground/50 mb-8">
          {t("We're launching in select Miami ZIP codes first to ensure consistently high-quality service from day one.")}
        </p>

        <div className="flex gap-3 max-w-md mx-auto mb-6">
          <input
            type="text"
            value={zip}
            onChange={(e) => { setZip(e.target.value); setResult(null); }}
            placeholder={t("Enter ZIP code e.g. 33183")}
            className="flex-1 bg-navy-deep border border-primary-foreground/20 text-primary-foreground rounded-lg px-4 py-3 text-sm placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-300"
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
          />
          <button onClick={handleCheck} className="bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-6 py-3 rounded-lg text-sm transition-all duration-300 hover:scale-105 animate-pulse-gold">
            {t("Check →")}
          </button>
        </div>

        {result && result.found && (
          <div className="mb-6">
            <p className="text-sm font-medium text-success transition-all duration-300">
              {`✓ ${t("We serve")} ${result.name}! ${t("Spots are limited — get started today.")}`}
            </p>
            <button
              onClick={() => {
                // Carry the confirmed ZIP forward the same way the wizard reads it.
                saveState({ ...loadState(), zip: result.zip || "", outOfCoverage: false });
                onStart?.();
              }}
              className="mt-4 bg-gold hover:bg-gold/90 text-gold-foreground font-bold text-base px-8 py-3.5 rounded-xl transition-all hover:scale-105 shadow-[0_0_24px_rgba(245,197,24,0.4)] hover:shadow-[0_0_36px_rgba(245,197,24,0.6)]"
            >
              {t("See your price — 60 seconds →")}
            </button>
          </div>
        )}

        {result && !result.found && (
          <div className="mb-6 max-w-md mx-auto text-left">
            <WaitlistCapture
              zip={result.zip || ""}
              source="homepage_zip_checker"
              onReset={() => { setResult(null); setZip(""); }}
            />
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {Object.entries(zipData).map(([code, name]) => (
            <span key={code} className="text-xs text-primary-foreground/40 bg-primary-foreground/5 rounded-full px-3 py-1">
              {code} {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ZipChecker;
