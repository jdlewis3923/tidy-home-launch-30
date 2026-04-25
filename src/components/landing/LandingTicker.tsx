import { useLanguage } from "@/contexts/LanguageContext";

const ITEMS = [
  "Licensed & Insured",
  "Background-Checked Pros",
  "Same Crew Every Visit",
  "Locked Monthly Price",
  "Cancel Anytime",
  "Photo Verified Visits",
  "Serving 33156 · 33183 · 33186",
  "4.9★ Average Rating",
  "Eco-Safe Products",
  "60-Second Signup",
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
