import { useLanguage } from "@/contexts/LanguageContext";

const items = [
  "Licensed & Insured",
  "Background-Checked Pros",
  "Cancel Anytime",
  "Photo Verified Every Visit",
  "No Long-Term Contracts",
  "4.9★ Average Rating",
  "Serving Kendall & Pinecrest",
  "From $85/mo",
  "One Simple Monthly Plan",
  "Zero Rebooking Required",
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
