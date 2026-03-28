import { useEffect, useRef, useState } from "react";

const stats = [
  { value: 100, suffix: "+", label: "Miami Homeowners" },
  { value: 4.9, suffix: "★", label: "Average Rating", isDecimal: true },
  { value: 3, suffix: "", label: "Core Services" },
  { value: 8, suffix: "", label: "ZIP Codes Served" },
  { value: 0, suffix: "", label: "Rebooking Required" },
];

const AnimatedNumber = ({ target, suffix, isDecimal }: { target: number; suffix: string; isDecimal?: boolean }) => {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) setStarted(true);
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const duration = 1500;
    const steps = 40;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(current);
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [started, target]);

  return (
    <div ref={ref} className="text-center px-4 md:px-8">
      <div className="text-3xl md:text-4xl font-extrabold text-primary-foreground">
        {isDecimal ? count.toFixed(1) : Math.floor(count)}{suffix}
      </div>
      <div className="text-xs uppercase tracking-wider text-primary-foreground/50 mt-1 font-medium">{stats.find(s => s.value === target)?.label}</div>
    </div>
  );
};

const ProofBar = () => (
  <section className="bg-navy py-8">
    <div className="max-w-6xl mx-auto flex flex-wrap justify-center gap-8 md:gap-0 md:justify-between px-4">
      {stats.map((s) => (
        <AnimatedNumber key={s.label} target={s.value} suffix={s.suffix} isDecimal={s.isDecimal} />
      ))}
    </div>
  </section>
);

export default ProofBar;
