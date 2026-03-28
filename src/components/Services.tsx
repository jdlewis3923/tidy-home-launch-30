import { Check } from "lucide-react";
import cleaningImg from "@/assets/cleaning-interior.jpg";
import lawnImg from "@/assets/lawn-care.jpg";
import carImg from "@/assets/car-detailing.jpg";
import FadeIn from "./FadeIn";

const services = [
  {
    title: "House Cleaning",
    badge: "⭐ Most Popular",
    image: cleaningImg,
    anchor: "Most popular · Members often pair with lawn care",
    priceMain: "From $159/mo",
    priceSub: "Biweekly from $275/mo",
    description: "Consistent interior care for a home that always feels reset. Handled on your schedule without lifting a finger.",
    checks: ["Kitchen & bathroom cleaning", "Floors vacuumed & mopped", "Dusting & surface wipe-down", "Trash removal"],
    accent: "border-t-primary",
  },
  {
    title: "Lawn Care",
    badge: null,
    image: lawnImg,
    anchor: "Best value · Pairs perfectly with cleaning",
    priceMain: "From $85/mo",
    priceSub: "Biweekly from $129/mo",
    description: "Professional lawn maintenance to keep your Miami home's exterior sharp year-round. No scheduling required, ever.",
    checks: ["Mowing to standard height", "Edging along walkways", "Debris blowing & cleanup", "Weekly or biweekly cadence"],
    accent: "border-t-success",
  },
  {
    title: "Car Detailing",
    badge: null,
    image: carImg,
    anchor: "Comes to your driveway · No drop-off needed",
    priceMain: "From $159/mo",
    priceSub: "Biweekly from $249/mo",
    description: "Driveway-ready detailing at your door. We come to you — exterior wash, interior vacuum, surface cleaning.",
    checks: ["Exterior hand wash & wheels", "Interior vacuum", "Interior surface wipe-down", "Monthly or biweekly"],
    accent: "border-t-violet-500",
  },
];

const Services = () => (
  <section id="services" className="bg-background py-20 px-4">
    <div className="max-w-6xl mx-auto">
      <FadeIn className="text-center mb-12">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">What's Included</span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">Everything your home needs. One simple plan.</h2>
        <p className="text-text-mid mt-4 max-w-2xl mx-auto">
          Three essential services. One subscription. Zero coordination required. Your schedule, your frequency — handled automatically every month.
        </p>
      </FadeIn>

      <FadeIn className="mb-12" delay={100}>
        <div className="bg-gradient-to-r from-primary/10 to-success/10 border border-primary/20 rounded-xl px-6 py-4 text-center">
          <span className="text-sm font-medium text-foreground">
            💡 Bundle services and save automatically — 2 services: <strong>15% off</strong> · 3 services: <strong>20% off</strong> — Applied at checkout automatically
          </span>
        </div>
      </FadeIn>

      <div className="grid md:grid-cols-3 gap-8">
        {services.map((s, i) => (
          <FadeIn key={s.title} delay={i * 150} direction={i === 0 ? "left" : i === 2 ? "right" : "up"} scale>
            <div className={`bg-card border rounded-xl overflow-hidden border-t-4 ${s.accent} h-full flex flex-col hover-lift`}>
              <div className="relative overflow-hidden">
                <img src={s.image} alt={s.title} loading="lazy" className="w-full h-48 object-cover transition-transform duration-700 hover:scale-105" />
                {s.badge && (
                  <span className="absolute top-3 left-3 bg-gold text-gold-foreground text-xs font-semibold px-3 py-1 rounded-full">{s.badge}</span>
                )}
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-xl font-bold text-foreground mb-1">{s.title}</h3>
                <p className="text-xs italic text-text-light mb-3">{s.anchor}</p>
                <div className="inline-flex gap-2 mb-4">
                  <span className="bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full">{s.priceMain}</span>
                  <span className="bg-muted text-muted-foreground text-xs font-medium px-3 py-1 rounded-full">{s.priceSub}</span>
                </div>
                <p className="text-sm text-text-mid mb-4 flex-1">{s.description}</p>
                <ul className="space-y-2">
                  {s.checks.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm text-foreground/80">
                      <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  </section>
);

export default Services;
