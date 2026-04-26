// Tidy — Client-side Meta Pixel bootstrap.
//
// Fetches the captured pixel ID from /functions/v1/meta-pixel-id (no auth,
// 5-min CDN cache), injects the standard fbq snippet once, then fires
// PageView on every React Router navigation. Runs server-side dual with
// the CAPI relay in track-conversion for full attribution.
//
// Designed to no-op gracefully when the OAuth flow hasn't been completed
// yet (pixel id missing or BLOCKED_*) — never throws, never blocks render.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PIXEL_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-pixel-id`;

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: unknown;
  }
}

let bootstrapped = false;
let bootstrapPromise: Promise<string | null> | null = null;

async function loadPixelId(): Promise<string | null> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    try {
      const res = await fetch(PIXEL_ENDPOINT, { method: 'GET' });
      if (!res.ok) return null;
      const json = (await res.json()) as { pixel_id?: string | null };
      const id = json?.pixel_id;
      if (!id || typeof id !== 'string' || id.startsWith('BLOCKED_')) return null;
      return id;
    } catch {
      return null;
    }
  })();
  return bootstrapPromise;
}

function injectFbqSnippet(pixelId: string): void {
  if (bootstrapped) return;
  bootstrapped = true;
  // Standard Meta Pixel base code, ported to TS.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = window as any;
  if (w.fbq) return;
  const n: any = function (...args: unknown[]) {
    n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
  };
  if (!w._fbq) w._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  w.fbq = n;
  const t = document.createElement('script');
  t.async = true;
  t.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const s = document.getElementsByTagName('script')[0];
  s.parentNode?.insertBefore(t, s);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  window.fbq?.('init', pixelId);
  window.fbq?.('track', 'PageView');
}

/**
 * Mount once at the top of the React tree. Fetches the pixel id on first
 * render, injects the fbq snippet (idempotent), then fires PageView on
 * every route change.
 */
export function MetaPixel(): null {
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    loadPixelId().then((id) => {
      if (cancelled || !id) return;
      injectFbqSnippet(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Only fire if fbq is initialized — otherwise the first PageView from
    // injectFbqSnippet covers the initial load.
    if (bootstrapped && typeof window.fbq === 'function') {
      window.fbq('track', 'PageView');
    }
  }, [location.pathname, location.search]);

  return null;
}
