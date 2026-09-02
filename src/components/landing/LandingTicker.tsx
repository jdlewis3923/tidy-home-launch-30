import { useLanguage } from "@/contexts/LanguageContext";

// One claim per slot, rendered EXACTLY ONCE. The old marquee doubled its items,
// so every claim printed twice on /bundle, /refer and the service pages —
// which read as the trust strip appearing twice and blew the per-page claim cap.
// "Background-Checked Pros" leads: it is the strongest trust claim we have and
// it sits above the fold on /neighbor, the page the door hangers point at.
// The ZIP list is deliberately NOT here: it already appears in the hero, the
// service-area section and the footer.
const ITEMS = [
  "Background-Checked Pros",
  "Same Pro Every Visit",
  "Locked Monthly Price",
  "Cancel Anytime",
  "Photo Verified Visits",
  "Eco-Safe Products",
];

/**
 * Static claim row — no marquee, no duplicated copy. The `single` prop is kept
 * for call-site compatibility; the row renders once either way.
 */
const LandingTicker = ({ single = true }: { single?: boolean }) => {
  const { t } = useLanguage();
  void single;
  return (
    <div className="bg-navy overflow-hidden border-y border-primary-foreground/10">
      <div className="flex flex-wrap justify-center py-2.5">
        {ITEMS.map((item, i) => (
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
