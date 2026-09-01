import { ShieldCheck, BadgeCheck, UserCheck, Lock, Ban, MapPin } from "lucide-react";
import Reveal from "./Reveal";
import { useLanguage } from "@/contexts/LanguageContext";

// "Vetted" was retired — the approved claim is "Background-Checked Pros", and
// it appears exactly once in this row (no adjacent duplicate slot).
const SIGNALS = [
  { Icon: UserCheck, label: "Background-Checked Pros" },
  { Icon: BadgeCheck, label: "Insured" },
  { Icon: ShieldCheck, label: "Photo-Verified Every Visit" },
  { Icon: Lock, label: "Locked Price" },
  { Icon: Ban, label: "Cancel Anytime" },
  { Icon: MapPin, label: "Serving 3 ZIPs" },
];


const TrustSignalRow = () => {
  const { t } = useLanguage();
  return (
    <Reveal>
      <div className="bg-section-alt border-y border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-4 md:py-5">
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 md:gap-x-8">
            {SIGNALS.map(({ Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 text-xs md:text-sm text-text-mid"
              >
                <Icon className="w-4 h-4 text-primary" aria-hidden="true" />
                <span className="font-medium">{t(label)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Reveal>
  );
};

export default TrustSignalRow;
