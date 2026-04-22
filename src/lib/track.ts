// Lightweight GTM dataLayer helper for named conversion events.
// Use alongside `pushEvent` in lib/tracking.ts — this one keeps the payload
// type tight for the 3 Google Ads conversion events.

type TrackPayload = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export function track(event: string, payload: TrackPayload = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...payload });
}
