import { useState, useCallback, useEffect, useRef } from "react";
import { Star, Check, Users, ChevronLeft, ChevronRight } from "lucide-react";
import testimonialsBg from "@/assets/testimonials-bg.jpg";

interface TestimonialsProps {
  onOpenPopup: () => void;
}

const testimonials = [
  {
    name: "Maria G.",
    location: "Kendall",
    quote: "I got my weekends back. My house, lawn, and car are just handled. I don't think about it anymore.",
  },
  {
    name: "Daniel R.",
    location: "Pinecrest",
    quote: "One subscription. One company. No juggling vendors. That's the win.",
  },
  {
    name: "Luis M.",
    location: "Kendall West",
    quote: "They show up on time and everything looks perfect. Worth every dollar.",
  },
  {
    name: "Carolina P.",
    location: "Pinecrest",
    quote: "My home has never looked this good consistently. The lawn, the floors, even my car — all spotless every single week.",
  },
  {
    name: "Jorge A.",
    location: "Kendall",
    quote: "I used to spend my Saturdays coordinating three different services. Now I just live my life. Tidy handles it all.",
  },
  {
    name: "Stephanie V.",
    location: "Kendall West",
    quote: "The convenience is unreal. One bill, one team, and everything at my home just stays pristine. Can't recommend enough.",
  },
  {
    name: "Ricardo T.",
    location: "Pinecrest",
    quote: "Professional, punctual, and thorough every single time. My neighbors keep asking who I use — I tell them Tidy.",
  },
  {
    name: "Ana M.",
    location: "Kendall",
    quote: "As a busy mom, this service is a lifesaver. House cleaned, lawn cut, car detailed — all without me lifting a finger.",
  },
  {
    name: "David L.",
    location: "Kendall West",
    quote: "I was skeptical at first, but after the first month I was hooked. The quality is top-tier and the price is right.",
  },
  {
    name: "Isabella C.",
    location: "Pinecrest",
    quote: "Worth every penny. My home looks magazine-ready every week and I finally have time for what actually matters.",
  },
];

const Testimonials = ({ onOpenPopup }: TestimonialsProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const cardsToShow = typeof window !== "undefined" && window.innerWidth >= 768 ? 3 : 1;
  const maxIndex = testimonials.length - cardsToShow;

  const scrollPrev = useCallback(() => {
    if (isAnimating || currentIndex <= 0) return;
    setDirection("right");
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentIndex((i) => Math.max(0, i - 1));
      setIsAnimating(false);
      setDirection(null);
    }, 300);
  }, [currentIndex, isAnimating]);

  const scrollNext = useCallback(() => {
    if (isAnimating || currentIndex >= maxIndex) return;
    setDirection("left");
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentIndex((i) => Math.min(maxIndex, i + 1));
      setIsAnimating(false);
      setDirection(null);
    }, 300);
  }, [currentIndex, maxIndex, isAnimating]);

  // Section fade-in on scroll
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`relative py-20 px-4 overflow-hidden transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
    >
      <img src={testimonialsBg} alt="Luxury home interior" loading="lazy" width={1920} height={1080} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-navy/60" />

      <div className="relative z-10 max-w-6xl mx-auto text-center">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Reviews</span>
        <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mt-3">Trusted by Miami homeowners</h2>
        <p className="text-primary-foreground/60 mt-4">Real homeowners. Real results.</p>

        <div className="flex flex-wrap justify-center gap-6 mt-8 mb-12">
          <span className="flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-2 text-sm text-primary-foreground">
            <Star className="w-4 h-4 text-gold fill-gold" /> Rated 4.9 by homeowners
          </span>
          <span className="flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-2 text-sm text-primary-foreground">
            <Users className="w-4 h-4" /> 100+ Miami members
          </span>
          <span className="flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-2 text-sm text-primary-foreground">
            <Check className="w-4 h-4 text-success" /> Licensed & Insured
          </span>
        </div>

        {/* Carousel */}
        <div className="relative">
          {/* Left Arrow */}
          <button
            onClick={scrollPrev}
            disabled={currentIndex <= 0}
            className="absolute -left-2 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-primary-foreground/10 backdrop-blur-md border border-primary-foreground/20 flex items-center justify-center text-primary-foreground hover:bg-primary-foreground/20 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-110"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Right Arrow */}
          <button
            onClick={scrollNext}
            disabled={currentIndex >= maxIndex}
            className="absolute -right-2 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-primary-foreground/10 backdrop-blur-md border border-primary-foreground/20 flex items-center justify-center text-primary-foreground hover:bg-primary-foreground/20 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-110"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Cards Track */}
          <div className="overflow-hidden mx-6 md:mx-8">
            <div
              ref={trackRef}
              className="flex transition-transform duration-500 ease-out"
              style={{
                transform: `translateX(-${currentIndex * (100 / cardsToShow)}%)`,
              }}
            >
              {testimonials.map((t, idx) => (
                <div
                  key={t.name}
                  className="shrink-0 px-3"
                  style={{ width: `${100 / cardsToShow}%` }}
                >
                  <div
                    className={`bg-card rounded-xl p-8 text-left relative hover-lift transition-all duration-500 ${
                      idx >= currentIndex && idx < currentIndex + cardsToShow
                        ? "opacity-100 scale-100"
                        : "opacity-40 scale-95"
                    }`}
                  >
                    <span className="absolute top-4 right-6 text-6xl text-primary/10 font-serif leading-none">"</span>
                    <div className="flex gap-0.5 mb-4">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 text-gold fill-gold" />
                      ))}
                    </div>
                    <p className="text-sm text-foreground/80 mb-6 italic">"{t.quote}"</p>
                    <p className="text-sm font-semibold text-foreground">— {t.name}, {t.location}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-2 mt-8">
            {Array.from({ length: maxIndex + 1 }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "w-6 bg-primary"
                    : "w-2 bg-primary-foreground/30 hover:bg-primary-foreground/50"
                }`}
              />
            ))}
          </div>
        </div>

        <button onClick={onOpenPopup} className="mt-12 bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-8 py-3.5 rounded-xl transition-colors">
          Request Early Access →
        </button>
      </div>
    </section>
  );
};

export default Testimonials;
