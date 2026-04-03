import { Check, X } from "lucide-react";
import cleaningImg from "@/assets/cleaning-interior.jpg";
import lawnImg from "@/assets/lawn-care.jpg";
import carImg from "@/assets/car-detailing.jpg";
import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";

const services = [
  {
    title: "House Cleaning",
    badge: "⭐ Most Popular",
    image: cleaningImg,
    anchor: "Most popular · Members often pair with lawn care",
    priceMain: "From $159/mo",
    priceSub: "Biweekly from $275/mo",
    description: "Consistent interior care for a home that always feels reset. Handled on your schedule without lifting a finger.",
    checks: ["Kitchen & bathroom deep clean", "Floors vacuumed & mopped", "Dusting all surfaces & fixtures", "Trash removal & liner replacement"],
    excludes: ["Deep carpet shampooing", "Window exterior washing", "Garage or attic cleaning"],
    addOns: "Deep clean, inside oven, inside fridge, interior windows",
    accent: "border-t-primary",
  },
  {
    title: "Lawn Care",
    badge: null,
    image: lawnImg,
    anchor: "Best value · Pairs perfectly with cleaning",
    priceMain: "From $75/mo",
    priceSub: "Biweekly from $119/mo",
    description: "Professional lawn maintenance to keep your Miami home's exterior sharp year-round. No scheduling required, ever.",
    checks: ["Mowing to standard height", "Edging along walkways & beds", "Debris blowing & full cleanup", "Weekly or biweekly cadence"],
    excludes: ["Tree trimming or removal", "Irrigation system repair", "Landscape design or planting"],
    addOns: "Hedge trimming, fertilization, pest treatment",
    accent: "border-t-success",
  },
  {
    title: "Car Detailing",
    badge: null,
    image: carImg,
    anchor: "Comes to your driveway · No drop-off needed",
    priceMain: "From $129/mo",
    priceSub: "Biweekly from $219/mo",
    description: "Driveway-ready detailing at your door. We come to you — exterior wash, interior vacuum, surface cleaning.",
    checks: ["Exterior hand wash & wheels", "Interior vacuum & floor mats", "Dashboard & surface wipe-down", "Monthly or biweekly visits"],
    excludes: ["Paint correction or ceramic coating", "Engine bay detailing", "Headlight restoration"],
    addOns: "Leather conditioning, clay bar, tire shine",
    accent: "border-t-violet-500",
  },
];

const Services = () => {
  const { t } = useLanguage();
  return (
    <section id="services" className="bg-background py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <FadeIn className="text-center mb-12">
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("What's Included")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{t("Everything your home needs. One plan.")}</h2>
        </FadeIn>

        <FadeIn className="mb-12" delay={100}>
          <div className="bg-gradient-to-r from-primary/10 to-success/10 border border-primary/20 rounded-xl px-6 py-4 text-center">
            <span className="text-sm font-medium text-foreground" dangerouslySetInnerHTML={{ __html: t("💡 Bundle services and save automatically — 2 services: <strong>15% off</strong> · 3 services: <strong>20% off</strong> — Applied at checkout automatically") }} />
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-8">
          {services.map((s) => (
            <div key={s.title} className={`bg-card border rounded-xl overflow-hidden border-t-4 ${s.accent} h-full flex flex-col hover-lift`}>
              <div className="relative overflow-hidden">
                <img src={s.image} alt={t(s.title)} loading="lazy" className="w-full h-48 object-cover" />
                {s.badge && (
                  <span className="absolute top-3 left-3 bg-gold text-gold-foreground text-xs font-semibold px-3 py-1 rounded-full">{t(s.badge)}</span>
                )}
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-xl font-bold text-foreground mb-1">{t(s.title)}</h3>
                <p className="text-xs italic text-text-light mb-3">{s.anchor}</p>
                <div className="inline-flex gap-2 mb-4">
                  <span className="bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full">{s.priceMain}</span>
                  <span className="bg-muted text-muted-foreground text-xs font-medium px-3 py-1 rounded-full">{s.priceSub}</span>
                </div>
                <p className="text-sm text-text-mid mb-4">{s.description}</p>

                {/* Included */}
                <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wide mb-2">{t("Included")}</p>
                <ul className="space-y-1.5 mb-4">
                  {s.checks.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm text-foreground/80">
                      <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                      {t(c)}
                    </li>
                  ))}
                </ul>

                {/* Not Included */}
                <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wide mb-2">{t("Not Included")}</p>
                <ul className="space-y-1.5 mb-4">
                  {s.excludes.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <X className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                      {t(c)}
                    </li>
                  ))}
                </ul>

                {/* Add-ons */}
                <div className="mt-auto pt-3 border-t">
                  <p className="text-xs text-text-light">
                    <span className="font-semibold text-foreground/70">{t("Add-ons:")}</span> {t(s.addOns)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
