import { useEffect, useRef, useState } from "react";
import { Star, Check, Users, ShieldCheck, Clock, ThumbsUp } from "lucide-react";
import testimonialsBg from "@/assets/testimonials-bg.jpg";
import testimonialsBgMobile from "@/assets/testimonials-bg-mobile.jpg";
import { useLanguage } from "@/contexts/LanguageContext";
import { pushEvent } from "@/lib/tracking";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import FadeIn from "./FadeIn";

interface TestimonialsProps {
  onOpenPopup: () => void;
}

const testimonials = [
  { name: "Maria G.", location: "Kendall", quote: "I got my weekends back. My house, lawn, and car are just handled. I don't think about it anymore." },
  { name: "Daniel R.", location: "Pinecrest", quote: "One subscription. One company. No juggling vendors. That's the win." },
  { name: "Luis M.", location: "Kendall West", quote: "They show up on time and everything looks perfect. Worth every dollar." },
  { name: "Carolina P.", location: "Pinecrest", quote: "My home has never looked this good consistently. The lawn, the floors, even my car — all spotless every single week." },
  { name: "Jorge A.", location: "Kendall", quote: "I used to spend my Saturdays coordinating three different services. Now I just live my life. Tidy handles it all." },
  { name: "Stephanie V.", location: "Kendall West", quote: "The convenience is unreal. One bill, one team, and everything at my home just stays pristine. Can't recommend enough." },
  { name: "Ricardo T.", location: "Pinecrest", quote: "Professional, punctual, and thorough every single time. My neighbors keep asking who I use — I tell them Tidy." },
  { name: "Ana M.", location: "Kendall", quote: "As a busy mom, this service is a lifesaver. House cleaned, lawn cut, car detailed — all without me lifting a finger." },
  { name: "David L.", location: "Kendall West", quote: "I was skeptical at first, but after the first month I was hooked. The quality is top-tier and the price is right." },
  { name: "Isabella C.", location: "Pinecrest", quote: "Worth every penny. My home looks magazine-ready every week and I finally have time for what actually matters." },
];

const doubledTestimonials = [...testimonials, ...testimonials];

const CARD_WIDTH = 360;
const GAP = 24;
const SPEED = 0.5;

const trustPillars = [
  { icon: ShieldCheck, title: "Vetted Professionals", desc: "Every pro is background-checked, licensed, and insured before their first visit." },
  { icon: Clock, title: "Reliable & Recurring", desc: "Same schedule, same quality. Your services run automatically, every single time." },
  { icon: ThumbsUp, title: "Satisfaction Guaranteed", desc: "Not happy? We'll make it right within 24 hours — re-service or credit, no questions." },
];

const Testimonials = ({ onOpenPopup }: TestimonialsProps) => {
  const { t } = useLanguage();
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const animRef = useRef<number>(0);
  const [paused, setPaused] = useState(false);

  const totalWidth = testimonials.length * (CARD_WIDTH + GAP);

  useEffect(() => {
    const animate = () => {
      if (!paused) {
        offsetRef.current += SPEED;
        if (offsetRef.current >= totalWidth) {
          offsetRef.current -= totalWidth;
        }
        if (trackRef.current) {
          trackRef.current.style.transform = `translateX(-${offsetRef.current}px)`;
        }
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [paused, totalWidth]);

  const ctaText = CUSTOMER_DASHBOARD_ENABLED ? "START MY PLAN →" : "Request Early Access →";
  const btnClass = CUSTOMER_DASHBOARD_ENABLED
    ? "mt-12 bg-gold hover:bg-gold/90 text-gold-foreground font-bold px-8 py-3.5 rounded-xl transition-all hover:scale-105 shadow-[0_0_20px_rgba(245,197,24,0.3)] animate-pulse-gold"
    : "mt-12 bg-gold hover:bg-gold/90 text-gold-foreground font-bold px-8 py-3.5 rounded-xl transition-all hover:scale-105 shadow-[0_0_20px_rgba(245,197,24,0.3)] animate-pulse-gold";

  return (
    <section className="relative py-20 px-4 overflow-hidden">
      <img src={testimonialsBgMobile} alt="Luxury Miami home" loading="lazy" width={1080} height={1920} className="absolute inset-0 w-full h-full object-cover md:hidden" />
      <img src={testimonialsBg} alt="Luxury home interior" loading="lazy" width={1920} height={1080} className="absolute inset-0 w-full h-full object-cover hidden md:block" />
      <div className="absolute inset-0 bg-navy/75" />

      <div className="relative z-10 max-w-6xl mx-auto text-center">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("Reviews")}</span>
        <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mt-3">{t("Trusted by homeowners")}</h2>

        <div className="flex flex-wrap justify-center gap-6 mt-8 mb-12">
          <span className="flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-2 text-sm text-primary-foreground">
            <Star className="w-4 h-4 text-gold fill-gold" /> {t("Rated 4.9 by homeowners")}
          </span>
          <span className="flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-2 text-sm text-primary-foreground">
            <Users className="w-4 h-4" /> {t("100+ Miami members")}
          </span>
          <span className="flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-2 text-sm text-primary-foreground">
            <Check className="w-4 h-4 text-success" /> {t("Licensed & Insured")}
          </span>
        </div>

        <div
          className="overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div
            ref={trackRef}
            className="flex will-change-transform"
            style={{ gap: `${GAP}px` }}
          >
            {doubledTestimonials.map((t_item, idx) => (
              <div
                key={`${t_item.name}-${idx}`}
                className="shrink-0"
                style={{ width: `${CARD_WIDTH}px` }}
              >
                <div className="bg-card rounded-xl p-8 text-left relative h-full">
                  <span className="absolute top-4 right-6 text-6xl text-primary/10 font-serif leading-none">"</span>
                  <div className="flex gap-0.5 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-gold fill-gold" />
                    ))}
                  </div>
                  <p className="text-sm text-foreground/80 mb-6 italic">"{t_item.quote}"</p>
                  <p className="text-sm font-semibold text-foreground">— {t_item.name}, {t_item.location}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            pushEvent("cta_click", { cta_id: "testimonials", cta_text: ctaText });
            onOpenPopup();
          }}
          className={btnClass}
        >
          {t(ctaText)}
        </button>

        {/* Trust pillars - only when dashboard ON */}
        {CUSTOMER_DASHBOARD_ENABLED && (
          <div className="grid md:grid-cols-3 gap-6 mt-16">
            {trustPillars.map((p, i) => {
              const Icon = p.icon;
              return (
                <FadeIn key={p.title} delay={i * 100}>
                  <div className="bg-primary-foreground/5 backdrop-blur-sm border border-primary-foreground/10 rounded-xl p-6 text-left">
                    <Icon className="w-6 h-6 text-primary mb-3" />
                    <h4 className="text-sm font-bold text-primary-foreground mb-1">{t(p.title)}</h4>
                    <p className="text-xs text-primary-foreground/60">{t(p.desc)}</p>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default Testimonials;
