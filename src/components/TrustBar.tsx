import { Check } from "lucide-react";
import FadeIn from "./FadeIn";

const items = [
  "Licensed & Insured",
  "Background-Checked Pros",
  "Photo Verified Every Visit",
  "Cancel Anytime",
  "No Long-Term Contracts",
];

const TrustBar = () => (
  <section className="bg-background border-y py-6">
    <div className="max-w-6xl mx-auto flex flex-wrap justify-center gap-x-8 gap-y-3 px-4">
      {items.map((item, i) => (
        <FadeIn key={item} delay={i * 80} direction="up" duration={500}>
          <span className="flex items-center gap-2 text-sm font-medium text-foreground/80">
            <Check className="w-4 h-4 text-success flex-shrink-0" />
            {item}
          </span>
        </FadeIn>
      ))}
    </div>
  </section>
);

export default TrustBar;
