import { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

/**
 * Fires a single GTM `page_view` event on initial load and on every
 * React Router route change. Mounted once at the top of the app so GA4
 * and Google Ads see every SPA navigation, not just the homepage.
 */
export function usePageViewTracking() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "page_view",
      page_path: location.pathname + location.search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [location.pathname, location.search]);
}
