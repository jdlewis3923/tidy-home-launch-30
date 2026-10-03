import { CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * The 48-hour guarantee as one bordered line with a check icon.
 * Used beneath the quote price and directly above the pay button.
 */
export const GUARANTEE_LINE = "Not right? We come back within 48 hours. Free.";

export default function GuaranteeLine({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <div
      role="note"
      data-testid="guarantee-line"
      className={`flex items-center gap-2.5 rounded-xl border border-ink/20 bg-white px-4 py-3 text-sm font-semibold text-ink ${className}`}
    >
      <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" strokeWidth={2.25} aria-hidden />
      <span>{t(GUARANTEE_LINE)}</span>
    </div>
  );
}
