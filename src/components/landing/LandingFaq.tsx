import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FaqItem {
  q: string;
  a: string;
}

interface Props {
  items: FaqItem[];
}

/**
 * Light wrapper around the existing FAQ accordion pattern (see
 * src/components/FAQ.tsx) — reused on the per-service LPs.
 */
const LandingFaq = ({ items }: Props) => {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={item.q}
            className="bg-card border rounded-lg overflow-hidden transition-shadow duration-300 hover:shadow-md"
          >
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-sm font-medium text-foreground">{item.q}</span>
              <ChevronDown
                className={`w-4 h-4 text-text-light transition-transform duration-300 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            <div
              className="overflow-hidden transition-all duration-300 ease-out"
              style={{
                maxHeight: isOpen ? "320px" : "0px",
                opacity: isOpen ? 1 : 0,
              }}
            >
              <div className="px-5 pb-4">
                <p className="text-sm text-text-mid leading-relaxed">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default LandingFaq;
