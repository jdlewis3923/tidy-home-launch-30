import { useLanguage } from "@/contexts/LanguageContext";

// One claim per slot. "Background-Checked" and "Background-Checked Pros" used
// to sit next to each other making the same claim — the shorter one is gone.
// The ZIP list is deliberately NOT here: it already appears in the hero, the
// service-area section and the footer, and a 4th pass reads as keyword stuffing.
// "Background-Checked Pros" is deliberately NOT here: the ticker doubles its
// items to loop, so it would render the claim twice and blow the per-page cap.
// The claim lives in the hero chip, the pricing trust row and a trust card.
const ITEMS = [
  "Same Crew Every Visit",
  "Locked Monthly Price",
  "Cancel Anytime",
  "Photo Verified Visits",
  "Eco-Safe Products",
];


/**
 * `single` renders the claim row exactly once, static, no marquee. /neighbor
 * uses it: the doubled marquee copy read as the trust strip appearing twice.
 */
const LandingTicker = ({ single = false }: { single?: boolean }) => {
  const { t } = useLanguage();
  const items = single ? ITEMS : [...ITEMS, ...ITEMS];
  return (
    <div className="bg-navy overflow-hidden whitespace-nowrap border-y border-primary-foreground/10">
      <div className={`${single ? "flex flex-wrap justify-center" : "animate-ticker inline-flex"} py-2.5`}>
        {items.map((item, i) => (
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
