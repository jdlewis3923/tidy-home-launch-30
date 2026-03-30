// GTM dataLayer helper — pushes events without blocking UI
declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export const pushEvent = (event: string, data?: Record<string, unknown>) => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...data });
};

// Scroll depth observer — fires once at 50% and 75%
export const initScrollTracking = () => {
  const fired = { 50: false, 75: false };
  const handler = () => {
    const scrollPct = Math.round(
      (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
    );
    if (scrollPct >= 50 && !fired[50]) {
      fired[50] = true;
      pushEvent("scroll_depth", { depth: 50 });
    }
    if (scrollPct >= 75 && !fired[75]) {
      fired[75] = true;
      pushEvent("scroll_depth", { depth: 75 });
    }
  };
  window.addEventListener("scroll", handler, { passive: true });
  return () => window.removeEventListener("scroll", handler);
};
