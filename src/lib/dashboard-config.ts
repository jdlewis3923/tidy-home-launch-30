// Master visibility toggle for the customer dashboard system.
// Set to true to enable the dashboard, login button, and all dashboard routes.
// Set to false to completely hide everything from the public.
export const CUSTOMER_DASHBOARD_ENABLED = true;

// Stripe integration toggle. Controls whether checkout/billing routes
// actually invoke Stripe flows or fall back to the pre-launch placeholder
// behavior. Keep OFF until Stripe keys + edge functions are connected.
// When enabled, /billing and /checkout flows will route through Stripe.
export const STRIPE_INTEGRATION_ENABLED = false;

// Master flag for the post-launch authenticated experience.
// Pre-launch: /account and /billing redirect to homepage.
// Post-launch (set true): /account becomes the customer dashboard,
// /billing opens the Stripe billing portal for authenticated users.
// This is intentionally separate from CUSTOMER_DASHBOARD_ENABLED so
// the plan-builder can ship before the authenticated account area.
export const CUSTOMER_ACCOUNT_ENABLED = false;
