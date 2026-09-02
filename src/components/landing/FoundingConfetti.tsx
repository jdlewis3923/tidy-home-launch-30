/**
 * One-shot confetti burst on /neighbor page load. Fires once, ~1.6s, then
 * unmounts entirely so it never costs anything on scroll. Skipped for visitors
 * who ask for reduced motion.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

const COLORS = ["#F7C618", "#2563EB", "#10B981", "#FFFFFF", "#0F1729"];

const FoundingConfetti = () => {
  const [alive, setAlive] = useState(true);

  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        id: i,
        left: 4 + Math.random() * 92,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 0.45,
        drift: (Math.random() - 0.5) * 90,
        spin: 180 + Math.random() * 540,
        size: 6 + Math.random() * 7,
      })),
    []
  );

  useEffect(() => {
    if (reduced) {
      setAlive(false);
      return;
    }
    const t = setTimeout(() => setAlive(false), 2400);
    return () => clearTimeout(t);
  }, [reduced]);

  if (!alive || reduced) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[55] h-[70vh] overflow-hidden"
    >
      {pieces.map(p => (
        <motion.span
          key={p.id}
          initial={{ y: -40, x: 0, opacity: 0, rotate: 0 }}
          animate={{
            y: "70vh",
            x: p.drift,
            opacity: [0, 1, 1, 0],
            rotate: p.spin,
          }}
          transition={{ duration: 1.8, delay: p.delay, ease: "easeIn" }}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.5,
            background: p.color,
            borderRadius: 1,
          }}
          className="absolute top-0 block"
        />
      ))}
    </div>
  );
};

export default FoundingConfetti;
