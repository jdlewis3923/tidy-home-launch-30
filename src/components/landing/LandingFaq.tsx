import { useState } from "react";
import { Plus } from "lucide-react";

export interface FaqItem {
  q: string;
  a: string;
}

interface Props {
  items: FaqItem[];
}

/**
 * FAQ accordion — smooth height animation, plus-to-x rotation, subtle
 * brand-tinted active header. Matches existing card visuals.
 */
const LandingFaq = ({ items }: Props) => {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={item.q}
            className={`bg-card border rounded-lg overflow-hidden transition-shadow duration-300 hover:shadow-md ${
              isOpen ? "ring-1 ring-primary/20" : ""
            }`}
          >
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors duration-200 ${
                isOpen ? "bg-primary/[0.05]" : ""
              }`}
              aria-expanded={isOpen}
            >
              <span className="text-sm font-medium text-foreground pr-3">{item.q}</span>
              <Plus
                className={`w-4 h-4 text-text-light flex-shrink-0 transition-transform duration-300 ${
                  isOpen ? "rotate-45 text-primary" : ""
                }`}
                aria-hidden="true"
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
