import heroImg from "@/assets/hero-miami-home.jpg";
import { useLanguage } from "@/contexts/LanguageContext";
import { pushEvent } from "@/lib/tracking";

interface HeroProps {
  onOpenPopup: () => void;
}

const Hero = ({ onOpenPopup }: HeroProps) => {
  const { t } = useLanguage();
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      <img src={heroImg} alt="Modern Miami home with pool and palm trees" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
      <div className="absolute inset-0 bg-navy/65" />

      <div className="absolute top-20 left-[15%] animate-sparkle">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.4"/></svg>
      </div>
      <div className="absolute top-40 right-[20%] animate-sparkle" style={{ animationDelay: "1.5s" }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.3"/></svg>
      </div>
      <div className="absolute bottom-32 left-[25%] animate-sparkle" style={{ animationDelay: "3s" }}>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="white" fillOpacity="0.35"/></svg>
      </div>

      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <div className="inline-flex items-center bg-primary/20 border border-primary/30 rounded-full px-4 py-1.5 mb-6">
          <span className="w-2 h-2 rounded-full bg-success mr-2 animate-pulse-dot" />
          <span className="text-xs font-medium text-primary-foreground">{t("Now accepting homes in Kendall & Pinecrest")}</span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-primary-foreground leading-tight mb-6">
          {t("Your Home. Handled.")}<br />{t("Every Month.")}
        </h1>

        <p className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mx-auto mb-8 leading-relaxed">
          {t("We handle scheduling, timing, and everything in between.")}
          <br />
          {t("Just set it — we'll take care of the rest.")}
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {["🏠 House Cleaning", "🌿 Lawn Care", "🚗 Car Detailing", "✓ Cancel Anytime"].map((pill) => (
            <span key={pill} className="bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-1.5 text-sm text-primary-foreground font-medium">
              {t(pill)}
            </span>
          ))}
        </div>

        <button onClick={onOpenPopup} className="bg-gold hover:bg-gold/90 text-gold-foreground font-bold text-lg px-8 py-4 rounded-xl transition-all hover:scale-105 shadow-lg">
          {t("Request Early Access — Get $50 Off →")}
        </button>

        <p className="mt-4 text-xs text-primary-foreground/50">
          {t("Limited founding memberships · No commitment required · Starting at $85/mo")}
        </p>
      </div>
    </section>
  );
};

export default Hero;
