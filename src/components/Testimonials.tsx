import { useEffect, useRef, useState } from "react";
import { Star, Check, Users } from "lucide-react";
import testimonialsBg from "@/assets/testimonials-bg.jpg";

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

const Testimonials = ({ onOpenPopup }: TestimonialsProps) => {
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

  return (
    <section className="relative py-20 px-4 overflow-hidden">
      <img src={testimonialsBg} alt="Luxury home interior" loading="lazy" width={1920} height={1080} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-navy/75" />

      <div className="relative z-10 max-w-6xl mx-auto text-center">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Reviews</span>
        <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mt-3">Trusted by homeowners</h2>
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
            {doubledTestimonials.map((t, idx) => (
              <div
                key={`${t.name}-${idx}`}
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
                  <p className="text-sm text-foreground/80 mb-6 italic">"{t.quote}"</p>
                  <p className="text-sm font-semibold text-foreground">— {t.name}, {t.location}</p>
                </div>
              </div>
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