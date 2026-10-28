/**
 * Founding page motion layer. One rAF-throttled scroll loop writes CSS variables;
 * pointer effects (tilt, spotlight, magnetic) are delegated. Fully inert under
 * prefers-reduced-motion or coarse pointers where hover effects don't apply.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

export function useFoundingMotion(root: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.add("fx-on");
    let raf = 0;
    const tick = () => {
      raf = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const y = window.scrollY;
      el.style.setProperty("--fx-page", (y / max).toFixed(4));
      el.style.setProperty("--fx-hero", Math.min(1, y / Math.max(1, window.innerHeight * 0.9)).toFixed(4));
      el.querySelectorAll<HTMLElement>("[data-fx-progress]").forEach((n) => {
        const r = n.getBoundingClientRect();
        const p = (window.innerHeight * 0.85 - r.top) / (r.height + window.innerHeight * 0.35);
        n.style.setProperty("--fx-p", Math.min(1, Math.max(0, p)).toFixed(4));
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    // Staggered in-view reveal for any [data-fx-in] element.
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("fx-in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    el.querySelectorAll("[data-fx-in]").forEach((n) => io.observe(n));

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onMove = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      const tilt = target?.closest<HTMLElement>("[data-fx-tilt]");
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--tx", (y * -6).toFixed(2) + "deg");
        tilt.style.setProperty("--ty", (x * 7).toFixed(2) + "deg");
        tilt.style.setProperty("--mx", ((x + 0.5) * 100).toFixed(1) + "%");
        tilt.style.setProperty("--my", ((y + 0.5) * 100).toFixed(1) + "%");
      }
      const spot = target?.closest<HTMLElement>("[data-fx-spot]");
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty("--sx", `${ev.clientX - r.left}px`);
        spot.style.setProperty("--sy", `${ev.clientY - r.top}px`);
      }
      const mag = target?.closest<HTMLElement>("[data-fx-magnet]");
      if (mag) {
        const r = mag.getBoundingClientRect();
        mag.style.setProperty("--gx", `${((ev.clientX - r.left) / r.width - 0.5) * 8}px`);
        mag.style.setProperty("--gy", `${((ev.clientY - r.top) / r.height - 0.5) * 6}px`);
      }
    };
    const onLeave = (ev: PointerEvent) => {
      const n = ev.target as HTMLElement;
      if (n.matches?.("[data-fx-tilt]")) { n.style.setProperty("--tx", "0deg"); n.style.setProperty("--ty", "0deg"); }
      if (n.matches?.("[data-fx-magnet]")) { n.style.setProperty("--gx", "0px"); n.style.setProperty("--gy", "0px"); }
    };
    if (fine) {
      el.addEventListener("pointermove", onMove, { passive: true });
      el.addEventListener("pointerleave", onLeave, true);
      el.addEventListener("pointerout", onLeave as EventListener, true);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave, true);
      el.removeEventListener("pointerout", onLeave as EventListener, true);
      el.classList.remove("fx-on");
    };
  }, [root]);
}

/** Eases a number toward its target; returns the target immediately under reduced motion. */
export function useCountUp(target: number, ms = 700) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms), e = 1 - Math.pow(1 - k, 3);
      const cur = a + (target - a) * e;
      setV(cur);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, ms]);
  return v;
}
