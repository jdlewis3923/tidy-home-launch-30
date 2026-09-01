import { useLanguage } from "@/contexts/LanguageContext";
import { trustClaims, ENTRY_PRICE_COPY, VETTED_CLAIM } from "@/lib/pricing-canon";

const items = [
  // The ticker doubles its items to loop, so the background-check claim would
  // print twice here. It lives in ProofBar, WhyTidy, the Testimonials trust row
  // and the FAQ instead.
  ...trustClaims().filter((c) => c !== VETTED_CLAIM),
  "No Long-Term Contracts",
  ENTRY_PRICE_COPY,
  "One Monthly Plan",
  "No Rebooking",
];

const AnnouncementTicker = () => {
  const { t } = useLanguage();
  const doubled = [...items, ...items];
  return (
    <div className="bg-navy overflow-hidden whitespace-nowrap mt-16">
      <div className="animate-ticker inline-flex py-2">
        {doubled.map((item, i) => (
          <span key={i} className="inline-flex items-center mx-4 text-xs text-primary-foreground/70 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-gold mr-3 flex-shrink-0" />
            {t(item)}
          </span>
        ))}
      </div>
    </div>
  );
};

export default AnnouncementTicker;
