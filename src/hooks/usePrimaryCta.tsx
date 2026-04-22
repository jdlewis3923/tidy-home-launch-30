import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import { buildSignupHref } from "@/lib/landing";
import { pushEvent } from "@/lib/tracking";

/**
 * One canonical primary-CTA hook used by every landing page, the bundle page,
 * the refer page, the sticky bar, the final-CTA block, and the navbar slot.
 *
 * Behavior is driven by `CUSTOMER_DASHBOARD_ENABLED` (the launch toggle):
 *
 *  • DASHBOARD ON  → CTA is a real navigation to `/signup?...` (which falls
 *                    through to /login → /dashboard/plan, preselecting the
 *                    chosen service/plan/bundle and forwarding all UTM /
 *                    promo / gclid params end-to-end into Stripe metadata).
 *  • DASHBOARD OFF → CTA opens the shared LeadPopup (Zapier webhook + SMS
 *                    consent), exactly like the homepage pre-launch flow.
 *
 * Consumers don't need to know which mode is active. They call
 * `getCtaProps({ service, plan, bundle, services, custom, trackingId, ctaText })`
 * and spread the result onto any `<Link>` or `<a>` (or `<button>` — `to`/`href`
 * is just ignored when popup mode is active).
 */

interface CtaOverrides {
  service?: string;
  plan?: string;
  bundle?: string;
  services?: string;
  custom?: string;
}

interface GetCtaPropsArgs extends CtaOverrides {
  trackingId: string;
  ctaText: string;
  /** Extra metadata to attach to the cta_click event */
  trackingMeta?: Record<string, string | number | boolean>;
}

interface CtaProps {
  /** Navigation target. Always safe to spread onto a <Link to=...> */
  to: string;
  /** Click handler — fires tracking, then either lets navigation happen or opens the popup. */
  onClick: (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
}

interface PrimaryCtaContextValue {
  /** True when CTAs should open the lead popup instead of navigating */
  popupMode: boolean;
  /** Open the lead popup directly (used by Navbar's onOpenPopup slot) */
  openPopup: () => void;
  /** Build props for any CTA. Returns { to, onClick } ready to spread. */
  getCtaProps: (args: GetCtaPropsArgs) => CtaProps;
}

const PrimaryCtaContext = createContext<PrimaryCtaContextValue | null>(null);

interface ProviderProps {
  children: ReactNode;
}

export const PrimaryCtaProvider = ({ children }: ProviderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [popupOpen, setPopupOpen] = useState(false);
  const popupMode = !CUSTOMER_DASHBOARD_ENABLED;

  const openPopup = useCallback(() => setPopupOpen(true), []);

  const getCtaProps = useCallback(
    ({ trackingId, ctaText, trackingMeta, ...overrides }: GetCtaPropsArgs): CtaProps => {
      const to = buildSignupHref(location.search, overrides);

      const onClick = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
        pushEvent("cta_click", {
          cta_id: trackingId,
          cta_text: ctaText,
          ...(trackingMeta ?? {}),
        });

        if (popupMode) {
          // Pre-launch: intercept and open the lead capture popup
          e.preventDefault();
          setPopupOpen(true);
          return;
        }
        // Post-launch: let the <Link> navigation proceed naturally.
      };

      return { to, onClick };
    },
    [location.search, popupMode]
  );

  const value = useMemo<PrimaryCtaContextValue>(
    () => ({ popupMode, openPopup, getCtaProps }),
    [popupMode, openPopup, getCtaProps]
  );

  return (
    <PrimaryCtaContext.Provider value={value}>
      {children}
      {popupMode && (
        <LazyLeadPopup
          isOpen={popupOpen}
          onClose={() => setPopupOpen(false)}
          onSuccess={() => {
            setPopupOpen(false);
            navigate("/thank-you");
          }}
        />
      )}
    </PrimaryCtaContext.Provider>
  );
};

export const usePrimaryCta = (): PrimaryCtaContextValue => {
  const ctx = useContext(PrimaryCtaContext);
  if (!ctx) {
    throw new Error("usePrimaryCta must be used inside <PrimaryCtaProvider>");
  }
  return ctx;
};

// ----- Lazy popup so pre-launch path doesn't pull in the form on post-launch builds.

import { lazy, Suspense } from "react";
const LeadPopup = lazy(() => import("@/components/LeadPopup"));

interface LazyProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}
const LazyLeadPopup = ({ isOpen, onClose, onSuccess }: LazyProps) => (
  <Suspense fallback={null}>
    <LeadPopup isOpen={isOpen} onClose={onClose} onSuccess={onSuccess} />
  </Suspense>
);
