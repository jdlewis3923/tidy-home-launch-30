/** Founding badge + the exact rates that are locked (from my_founding()). */
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

type Line = { service?: string; size?: number; size_tier?: number; cadence?: string; monthly_cents?: number };
type Founding = { number: number; zip: string; rate_card_version: number; lines: Line[] };

const SERVICE: Record<string, string> = { cleaning: "House Cleaning", lawn: "Lawn Care", detailing: "Car Care" };
const CADENCE: Record<string, string> = { weekly: "Weekly", biweekly: "Every two weeks", monthly: "Monthly" };

export default function FoundingBadge() {
  const { t } = useLanguage();
  const [f, setF] = useState<Founding | null>(null);
  useEffect(() => {
    supabase.rpc("my_founding").then(({ data }) => setF((data as unknown as Founding) ?? null));
  }, []);
  if (!f) return null;
  return (
    <section className="rounded-3xl border-2 border-[hsl(var(--gold))] bg-card p-6 shadow-sm" data-testid="founding-badge">
      <p className="flex items-center gap-2 text-lg font-black text-ink">
        <Lock className="h-4 w-4 text-[hsl(var(--gold))]" />
        {t("Founding Home")} #{f.number} {t("in")} {f.zip} — {t("your price is locked.")}
      </p>
      {f.lines?.length > 0 && (
        <ul className="mt-4 divide-y divide-[hsl(var(--hairline))] text-sm">
          {f.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <span className="text-ink">
                {t(SERVICE[l.service ?? ""] ?? l.service ?? "")} · {t("Size")} {l.size_tier ?? l.size} · {t(CADENCE[l.cadence ?? ""] ?? l.cadence ?? "")}
              </span>
              <span className="font-semibold text-ink">{l.monthly_cents != null ? `$${(Number(l.monthly_cents) / 100).toFixed(0)}/mo` : ""}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        {t("If you change size or how often, you still get founding-era prices.")}
      </p>
    </section>
  );
}
