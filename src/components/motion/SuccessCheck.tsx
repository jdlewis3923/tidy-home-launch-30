/**
 * SuccessCheck — animated checkmark draw + caption.
 * Drops in after a save/reschedule/etc completes. Auto-fades after ~800ms.
 */
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  show: boolean;
  label?: string;
}

export default function SuccessCheck({ show, label = "you're all set." }: Props) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col items-center gap-2 py-4"
          aria-live="polite"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50">
            <svg
              className="draw-check h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="hsl(142 71% 38%)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12.5l5 5 11-11" />
            </svg>
          </span>
          <p className="text-sm font-semibold text-ink lowercase">{label}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
