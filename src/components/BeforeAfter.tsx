import { X, Check } from "lucide-react";
import FadeIn from "./FadeIn";

const BeforeAfter = () => (
  <section className="bg-background py-20 px-4">
    <div className="max-w-5xl mx-auto text-center">
      <FadeIn>
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">The difference</span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-12">Life before and after Tidy</h2>
      </FadeIn>

      <div className="grid md:grid-cols-2 gap-6">
        <FadeIn direction="left" scale>
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-8 text-left h-full">
            <h3 className="text-lg font-bold text-foreground mb-6">❌ Before Tidy</h3>
            <ul className="space-y-4">
              {[
                "Multiple vendors to coordinate separately",
                "Inconsistent, unreliable scheduling",
                "Missed appointments & no-shows",
                "Constant rebooking headaches",
                "Hours lost managing home services monthly",
                "Three separate bills every month",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-foreground/80">
                  <X className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </FadeIn>
        <FadeIn direction="right" scale delay={150}>
          <div className="bg-success/5 border border-success/20 rounded-xl p-8 text-left h-full">
            <h3 className="text-lg font-bold text-foreground mb-6">✅ With Tidy</h3>
            <ul className="space-y-4">
              {[
                "One simple monthly subscription",
                "Everything runs on autopilot",
                "Reliable, on-time every single visit",
                "Zero coordination ever required",
                "5–10 hours back every week",
                "One clean monthly bill",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-foreground/80">
                  <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </FadeIn>
      </div>
    </div>
  </section>
);

export default BeforeAfter;
