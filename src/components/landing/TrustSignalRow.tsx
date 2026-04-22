import { ShieldCheck, BadgeCheck, UserCheck, Lock, Ban, MapPin } from "lucide-react";
import Reveal from "./Reveal";

const SIGNALS = [
  { Icon: ShieldCheck, label: "Licensed" },
  { Icon: BadgeCheck, label: "Insured" },
  { Icon: UserCheck, label: "Background-Checked" },
  { Icon: Lock, label: "Locked Price" },
  { Icon: Ban, label: "Cancel Anytime" },
  { Icon: MapPin, label: "Serving 3 ZIPs" },
];

/**
 * Compact horizontal trust row sitting between hero and plans.
 */
const TrustSignalRow = () => (
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
              <span className="font-medium">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </Reveal>
);

export default TrustSignalRow;
