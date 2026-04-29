/**
 * Decorative sparkles that float over dark hero/CTA sections.
 * Mirrors the sparkles used in the homepage Hero. Pure decoration —
 * aria-hidden, respects prefers-reduced-motion via the global rule on
 * .animate-sparkle in index.css.
 */
const Star = ({
  size,
  opacity,
  delay = "0s",
  duration,
}: {
  size: number;
  opacity: number;
  delay?: string;
  duration?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    style={{ animationDelay: delay, ...(duration ? { animationDuration: duration } : {}) }}
    className="animate-sparkle"
  >
    <path
      d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z"
      fill="white"
      fillOpacity={opacity}
    />
  </svg>
);

const SparkleField = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
    <div className="absolute top-16 left-[12%]"><Star size={16} opacity={0.4} /></div>
    <div className="absolute top-32 right-[18%]"><Star size={12} opacity={0.3} delay="1.5s" /></div>
    <div className="absolute bottom-24 left-[22%]"><Star size={10} opacity={0.35} delay="3s" /></div>
    <div className="absolute bottom-16 right-[14%]"><Star size={14} opacity={0.32} delay="2.2s" /></div>

    {/* Added — more movement across the hero */}
    <div className="absolute top-[18%] left-[42%]"><Star size={9} opacity={0.32} delay="0.8s" duration="3.2s" /></div>
    <div className="absolute top-[8%] right-[36%]"><Star size={11} opacity={0.28} delay="2.6s" /></div>
    <div className="absolute top-[55%] left-[6%]"><Star size={13} opacity={0.3} delay="1.1s" duration="4.6s" /></div>
    <div className="absolute top-[48%] right-[8%]"><Star size={10} opacity={0.34} delay="3.4s" /></div>
    <div className="absolute bottom-[38%] left-[48%]"><Star size={8} opacity={0.28} delay="0.4s" duration="3.6s" /></div>
    <div className="absolute bottom-[10%] left-[40%]"><Star size={12} opacity={0.3} delay="2s" /></div>
    <div className="absolute top-[28%] right-[48%]"><Star size={7} opacity={0.26} delay="1.8s" duration="3.8s" /></div>
    <div className="absolute bottom-[44%] right-[28%]"><Star size={11} opacity={0.3} delay="2.8s" /></div>
  </div>
);

export default SparkleField;
