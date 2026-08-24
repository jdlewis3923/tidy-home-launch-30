import { useEffect, useState } from 'react';
import {
  capturePromoFromUrl,
  getPromoCode,
  isPromoBannerDismissed,
} from '@/lib/promo';

/**
 * Mount once at the app root. Captures `?promo=CODE` from the URL on every
 * page load and stores it in sessionStorage (first-wins).
 */
export function usePromoCapture() {
  useEffect(() => {
    capturePromoFromUrl();
  }, []);
}

/**
 * Reactive view of the current promo state. Components (banner, manual-entry
 * input) subscribe to `tidy:promo-changed` so they re-render when the code
 * is set, dismissed, or cleared.
 */
export function usePromoState() {
  const [code, setCode] = useState<string | null>(() => getPromoCode());
  const [dismissed, setDismissed] = useState<boolean>(() => isPromoBannerDismissed());

  useEffect(() => {
    const sync = () => {
      setCode(getPromoCode());
      setDismissed(isPromoBannerDismissed());
    };
    window.addEventListener('tidy:promo-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('tidy:promo-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return { code, dismissed };
}
