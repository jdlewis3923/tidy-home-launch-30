import { useEffect, useRef, useState } from "react";

type Direction = "up" | "down" | "left" | "right" | "none";

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: Direction;
  duration?: number;
  scale?: boolean;
}

const getTransform = (direction: Direction, scale: boolean, visible: boolean) => {
  if (visible) return "translate(0,0) scale(1)";
  const s = scale ? " scale(0.96)" : "";
  switch (direction) {
    case "up": return `translateY(24px)${s}`;
    case "down": return `translateY(-24px)${s}`;
    case "left": return `translateX(40px)${s}`;
    case "right": return `translateX(-40px)${s}`;
    case "none": return scale ? "scale(0.96)" : "none";
  }
};

export const useFadeIn = (threshold = 0.1) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, className: `transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}` };
};

const FadeIn = ({ children, className = "", delay = 0, direction = "up", duration = 700, scale = false }: FadeInProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: getTransform(direction, scale, visible),
        transition: `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
};

export default FadeIn;
