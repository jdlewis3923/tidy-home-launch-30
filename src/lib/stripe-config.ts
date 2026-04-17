/**
 * Tidy — Stripe Integration Configuration
 *
 * Centralized configuration for all Stripe-related URLs and routing.
 * No Stripe URLs should be hardcoded anywhere in the UI — always go
 * through this module so they can be swapped to branded/custom domains
 * later without touching components.
 *
 * Environment-driven: when VITE_STRIPE_CHECKOUT_DOMAIN and friends are
 * set, those override the defaults. This lets us point checkout/billing
 * at custom-domain Stripe endpoints (e.g. pay.jointidy.co) post-launch
 * without code changes.
 */

import { STRIPE_INTEGRATION_ENABLED, CUSTOMER_ACCOUNT_ENABLED } from "./dashboard-config";

// ---------- Internal app routes (relative paths) ----------
// These are the routes inside our app. Stripe redirects back to these
// after checkout / billing portal sessions complete.
export const APP_ROUTES = {
  HOME: "/",
  ACCOUNT: "/account",
  BILLING: "/billing",
  CHECKOUT_SUCCESS: "/checkout/success",
  CHECKOUT_CANCELED: "/checkout/canceled",
} as const;

// ---------- Stripe-managed domains (overridable via env) ----------
// Optional custom-domain overrides. Leave undefined to use Stripe's
// default hosted checkout / billing portal URLs returned by the API.
export const STRIPE_DOMAINS = {
  // Optional: custom domain for Stripe Checkout (e.g. "pay.jointidy.co")
  CHECKOUT: import.meta.env.VITE_STRIPE_CHECKOUT_DOMAIN as string | undefined,
  // Optional: custom domain for Stripe Billing Portal (e.g. "billing.jointidy.co")
  BILLING: import.meta.env.VITE_STRIPE_BILLING_DOMAIN as string | undefined,
} as const;

// ---------- Return URL builders ----------
// Always build absolute URLs from the current window origin so Stripe
// can redirect cleanly. Pre-launch, all returns route to "/" so any
// stray external return lands somewhere safe.
function origin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/**
 * Where Stripe sends the customer after a SUCCESSFUL checkout.
 * Pre-launch: homepage. Post-launch: dedicated success page.
 */
export function getCheckoutSuccessUrl(sessionParam = true): string {
  if (!STRIPE_INTEGRATION_ENABLED) return `${origin()}${APP_ROUTES.HOME}`;
  const suffix = sessionParam ? "?session_id={CHECKOUT_SESSION_ID}" : "";
  return `${origin()}${APP_ROUTES.CHECKOUT_SUCCESS}${suffix}`;
}

/**
 * Where Stripe sends the customer after a CANCELED checkout.
 * Pre-launch: homepage. Post-launch: canceled page (falls back to home).
 */
export function getCheckoutCancelUrl(): string {
  if (!STRIPE_INTEGRATION_ENABLED) return `${origin()}${APP_ROUTES.HOME}`;
  return `${origin()}${APP_ROUTES.CHECKOUT_CANCELED}`;
}

/**
 * Where Stripe Billing Portal returns the customer after they finish
 * managing their subscription.
 * Pre-launch: homepage. Post-launch: account dashboard.
 */
export function getBillingReturnUrl(): string {
  if (!CUSTOMER_ACCOUNT_ENABLED) return `${origin()}${APP_ROUTES.HOME}`;
  return `${origin()}${APP_ROUTES.ACCOUNT}`;
}

// ---------- Edge function endpoints ----------
// Names of the Supabase edge functions that will handle Stripe flows.
// Functions don't exist yet — these names are reserved so client code
// can be written against them now and "just work" when deployed.
export const STRIPE_FUNCTIONS = {
  CREATE_CHECKOUT: "stripe-create-checkout",
  CREATE_PORTAL_SESSION: "stripe-create-portal-session",
  WEBHOOK: "stripe-webhook",
} as const;

// ---------- Status helpers ----------
export const stripeStatus = {
  isEnabled: () => STRIPE_INTEGRATION_ENABLED,
  isAccountEnabled: () => CUSTOMER_ACCOUNT_ENABLED,
};
