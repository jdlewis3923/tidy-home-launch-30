import TidyLogo from "./TidyLogo";
import { Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { pushEvent } from "@/lib/tracking";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";

interface FinalCTAProps {
  onOpenPopup: () => void;
}

const FinalCTA = ({ onOpenPopup }: FinalCTAProps) => {
  const { t } = useLanguage();
  return (
    <section className="bg-gradient-to-b from-navy to-primary-deep py-24 px-4 relative overflow-hidden">
      <div className="relative z-10 max-w-2xl mx-auto text-center flex flex-col items-center">
        <div className="animate-bounce-float mb-8">
          <TidyLogo size="lg" withBackground />
        </div>

        <h2 className="text-3xl md:text-5xl font-bold text-primary-foreground mb-4">{t("You'll never book a home service again.")}</h2>
        <p className="text-primary-foreground/70 font-medium mb-2">{t("One setup. Everything handled.")}</p>
        <p className="text-primary-foreground/50 mb-8">{t("No contracts. No payments until launch.")}</p>

        <button id="cta-final" data-track="cta_final" onClick={() => { pushEvent("cta_click", { cta_id: "final_cta", cta_text: CUSTOMER_DASHBOARD_ENABLED ? "START MY PLAN" : "Get Started" }); onOpenPopup(); }} className="bg-gold hover:bg-gold/90 text-gold-foreground font-bold text-lg px-10 py-4 rounded-xl transition-all hover:scale-105 shadow-[0_0_24px_rgba(245,197,24,0.4)] hover:shadow-[0_0_36px_rgba(245,197,24,0.6)] animate-pulse-gold">
          {t(CUSTOMER_DASHBOARD_ENABLED ? "START MY PLAN →" : "Get Started — Request Early Access →")}
        </button>

        <div className="flex flex-wrap justify-center gap-4 mt-8">
          {["Licensed & Insured", "Background-Checked Pros", "Cancel Anytime", "4.9★ Rating", "Miami-Based"].map((item) => (
            <span key={item} className="flex items-center gap-1.5 text-xs text-primary-foreground/40">
              <Check className="w-3 h-3 text-success" />
              {t(item)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
