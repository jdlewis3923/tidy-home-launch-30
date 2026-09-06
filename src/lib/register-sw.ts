/**
 * The single place a service worker is ever registered.
 *
 * Refuses in dev, inside an iframe, in any Lovable preview host, and when
 * ?sw=off is present — and unregisters any stale worker in those cases, so a
 * Pro's schedule can never be served from a stale cache.
 */
const PRO_SW_URL = "/pro-sw.js";
const LEGACY_SW_URL = "/sw.js";

function refused(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  if (window.self !== window.top) return true;
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).has("sw")) {
    return new URLSearchParams(window.location.search).get("sw") === "off";
  }
  return false;
}

async function unregisterMatching(scriptUrls: string[]) {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => {
        const script = r.active?.scriptURL ?? r.installing?.scriptURL ?? "";
        return scriptUrls.some((url) => script.endsWith(url));
      })
      .map((r) => r.unregister()),
  );
}

export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  // Remove the former root-scoped worker everywhere. It controlled /dashboard
  // as well as /pro and caused Chrome to conflate both installable apps.
  await unregisterMatching([LEGACY_SW_URL]);
  if (refused()) {
    await unregisterMatching([PRO_SW_URL]);
    return;
  }
  if (!window.location.pathname.startsWith("/pro/")) return;
  try {
    await navigator.serviceWorker.register(PRO_SW_URL, { scope: "/pro/" });
  } catch {
    // Offline support is best-effort; the app works without it.
  }
}
