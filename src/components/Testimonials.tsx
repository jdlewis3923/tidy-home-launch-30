import { Star, Check, Users } from "lucide-react";
import miamiWaterfront from "@/assets/miami-waterfront.jpg";

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
    location: "Kendall Lakes",
    quote: "They show up on time and everything looks perfect. Worth every dollar.",
  },
];

const Testimonials = ({ onOpenPopup }: TestimonialsProps) => (
  <section className="relative py-20 px-4 overflow-hidden">
    <img src={miamiWaterfront} alt="Miami waterfront" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
    <div className="absolute inset-0 bg-navy/80" />

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

      <div className="grid md:grid-cols-3 gap-6">
        {testimonials.map((t) => (
          <div key={t.name} className="bg-card rounded-xl p-8 text-left relative hover-lift">
            <span className="absolute top-4 right-6 text-6xl text-primary/10 font-serif leading-none">"</span>
            <div className="flex gap-0.5 mb-4">
              {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 text-gold fill-gold" />)}
            </div>
            <p className="text-sm text-foreground/80 mb-6 italic">"{t.quote}"</p>
            <p className="text-sm font-semibold text-foreground">— {t.name}, {t.location}</p>
          </div>
        ))}
      </div>

      <button onClick={onOpenPopup} className="mt-12 bg-primary hover:bg-primary-deep text-primary-foreground font-semibold px-8 py-3.5 rounded-xl transition-colors">
        Request Early Access →
      </button>
    </div>
  </section>
);

export default Testimonials;
