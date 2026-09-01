import { useLanguage } from "@/contexts/LanguageContext";

// One claim per slot. "Background-Checked" and "Background-Checked Pros" used
// to sit next to each other making the same claim — the shorter one is gone.
// The ZIP list is deliberately NOT here: it already appears in the hero, the
// service-area section and the footer, and a 4th pass reads as keyword stuffing.
const ITEMS = [
  "Background-Checked Pros",
  "Same Crew Every Visit",
  "Locked Monthly Price",
  "Cancel Anytime",
  "Photo Verified Visits",
  "Eco-Safe Products",
];


const LandingTicker = () => {
  const { t } = useLanguage();
  const doubled = [...ITEMS, ...ITEMS];
  return (
    <div className="bg-navy overflow-hidden whitespace-nowrap border-y border-primary-foreground/10">
      <div className="animate-ticker inline-flex py-2.5">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center mx-5 text-xs text-primary-foreground/75 font-medium"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gold mr-3 flex-shrink-0" />
            {t(item)}
          </span>
        ))}
      </div>
    </div>
  );
};

export default LandingTicker;
