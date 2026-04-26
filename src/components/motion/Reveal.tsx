/**
 * Reveal — fade + rise on scroll into view.
 * Tiny IntersectionObserver wrapper. Stagger via `delay` prop (ms).
 * Reduces to identity when prefers-reduced-motion.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  /** px from viewport edge to trigger early. Default 64. */
  rootMargin?: string;
}

export default function Reveal({
  children,
  delay = 0,
  className = "",
  as = "div",
  rootMargin = "0px 0px -64px 0px",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      { rootMargin, threshold: 0.05 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [rootMargin]);

  const Tag = as as any;
  return (
    <Tag
      ref={ref as any}
      className={`${shown ? "reveal-in" : "reveal-init"} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
