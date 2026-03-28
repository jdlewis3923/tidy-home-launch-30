import { useState } from "react";

const zipData: Record<string, string> = {
  "33183": "Kendall",
  "33186": "Kendall West",
  "33156": "Pinecrest",
};

const ZipChecker = () => {
  const [zip, setZip] = useState("");
  const [result, setResult] = useState<{ found: boolean; name?: string; zip?: string } | null>(null);

  const handleCheck = () => {
    const trimmed = zip.trim();
    if (zipData[trimmed]) {
      setResult({ found: true, name: zipData[trimmed] });
    } else {
      setResult({ found: false, zip: trimmed });
    }
  };

  return (
    <section className="bg-navy py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_hsl(217_91%_60%_/_0.15),_transparent_70%)]" />

      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">Is Tidy in your neighborhood?</h2>
        <p className="text-primary-foreground/50 mb-8">
          We're launching in select Miami ZIP codes first to ensure consistently high-quality service from day one.
        </p>

        <div className="flex gap-3 max-w-md mx-auto mb-6">
          <input
            type="text"
            value={zip}
            onChange={(e) => { setZip(e.target.value); setResult(null); }}
            placeholder="Enter ZIP code e.g. 33183"
            className="flex-1 bg-navy-deep border border-primary-foreground/20 text-primary-foreground rounded-lg px-4 py-3 text-sm placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-300"
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
          />
          <button onClick={handleCheck} className="bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-6 py-3 rounded-lg text-sm transition-all duration-300 hover:scale-105">
            Check →
          </button>
        </div>

        {result && (
          <p className={`text-sm font-medium mb-6 transition-all duration-300 ${result.found ? "text-success" : "text-destructive"}`}>
            {result.found
              ? `✓ We serve ${result.name}! Spots are limited — get started today.`
              : `We're not in ${result.zip} yet, but expanding fast. Email hello@jointidy.co to join the waitlist.`}
          </p>
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