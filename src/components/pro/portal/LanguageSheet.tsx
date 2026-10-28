/** Bottom sheet language picker — switches the interface in place (no reload). */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LanguageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language, setLanguage } = useLanguage();
  const [pick, setPick] = useState<"en" | "es">(language as "en" | "es");
  const reduce = useReducedMotion();
  useEffect(() => { if (open) setPick(language as "en" | "es"); }, [open, language]);
  const es = language === "es";
  const opts: { key: "en" | "es"; label: string; flag: string }[] = [
    { key: "en", label: "English", flag: "🇺🇸" },
    { key: "es", label: "Español", flag: "🇪🇸" },
  ];
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <button type="button" aria-label={es ? "Cerrar" : "Close"} onClick={onClose} className="absolute inset-0 bg-[hsl(var(--pro-navy)/0.6)] backdrop-blur-[2px]" />
          <motion.div
            role="dialog" aria-modal="true" aria-label={es ? "Elegir idioma" : "Choose Language"}
            initial={reduce ? { opacity: 0 } : { y: "100%" }} animate={reduce ? { opacity: 1 } : { y: 0 }} exit={reduce ? { opacity: 0 } : { y: "100%" }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-[22px] bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5"
          >
            <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-[hsl(var(--pro-line))]" />
            <h2 className="mb-3 text-[17px] font-bold text-[hsl(var(--pro-ink))]">{es ? "Elegir idioma" : "Choose Language"}</h2>
            <div className="space-y-2.5" role="radiogroup">
              {opts.map((o) => (
                <button key={o.key} type="button" role="radio" aria-checked={pick === o.key} onClick={() => setPick(o.key)}
                  className={`flex min-h-[52px] w-full items-center gap-3.5 rounded-[12px] border px-4 text-left transition-colors duration-150 ${pick === o.key ? "border-[hsl(var(--pro-blue)/0.35)] bg-[hsl(var(--pro-blue-soft))]" : "border-[hsl(var(--pro-line))] bg-white"}`}>
                  <span aria-hidden className="text-[26px] leading-none">{o.flag}</span>
                  <span className="flex-1 text-[15px] font-medium text-[hsl(var(--pro-ink))]">{o.label}</span>
                  {pick === o.key && (
                    <motion.span initial={reduce ? false : { scale: 0.6 }} animate={{ scale: 1 }} transition={{ duration: 0.15 }}
                      className="grid h-6 w-6 place-items-center rounded-full bg-[hsl(var(--pro-blue))] text-primary-foreground">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                    </motion.span>
                  )}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setLanguage(pick); onClose(); }}
              className="mt-4 min-h-[48px] w-full rounded-[12px] bg-[hsl(var(--pro-blue))] text-[15px] font-semibold text-primary-foreground active:scale-[0.99]">
              {pick === "es" ? "Guardar" : "Save"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
