/**
 * AddonCelebration — short, calm "you added it" moment.
 *
 * Triggered after a successful add-on attach. A green check pulses,
 * the addon name floats up, and 14 confetti dots burst once, then
 * the overlay auto-dismisses after 1500ms. Designed to feel like a
 * small reward — not a Vegas slot machine.
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

interface Props {
  show: boolean;
  label: string;
  onDone: () => void;
}

const COLORS = ['#0F172A', '#2563EB', '#F5C518', '#10B981', '#EC4899'];

export default function AddonCelebration({ show, label, onDone }: Props) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [show, onDone]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none fixed inset-0 z-[60] grid place-items-center"
          aria-live="polite"
        >
          {/* Soft scrim */}
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" />

          {/* Center card */}
          <motion.div
            initial={{ scale: 0.85, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="relative rounded-2xl bg-white px-8 py-7 text-center shadow-2xl"
          >
            <motion.div
              initial={{ scale: 0.4 }}
              animate={{ scale: [0.4, 1.18, 1] }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50"
            >
              <Check className="h-7 w-7 text-emerald-600" strokeWidth={3} />
            </motion.div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">added</p>
            <p className="mt-1 max-w-[16rem] text-base font-bold text-ink">{label}</p>

            {/* Confetti burst */}
            {Array.from({ length: 14 }).map((_, i) => {
              const angle = (Math.PI * 2 * i) / 14;
              const dist = 70 + (i % 3) * 14;
              const x = Math.cos(angle) * dist;
              const y = Math.sin(angle) * dist;
              return (
                <motion.span
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
                  animate={{ x, y, opacity: 0, scale: 1 }}
                  transition={{ duration: 0.9, ease: [0.2, 0.7, 0.3, 1] }}
                  className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
              );
            })}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
