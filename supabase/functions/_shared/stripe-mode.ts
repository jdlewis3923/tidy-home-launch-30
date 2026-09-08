// Which Stripe environment the app is transacting in.
//
// The publishable key on the site and the secret key on the server MUST be the
// same mode — a pk_test front end with an sk_live back end cannot complete a
// payment at all. STRIPE_MODE picks the pair; it defaults to live so nothing
// silently drops into test on its own.
//
//   STRIPE_MODE unset or "live"  -> STRIPE_SECRET_KEY
//   STRIPE_MODE = "test"         -> STRIPE_TEST_SECRET_KEY

export type StripeMode = "live" | "test";

export function stripeMode(): StripeMode {
  return (Deno.env.get("STRIPE_MODE") ?? "live").toLowerCase() === "test" ? "test" : "live";
}

/** The secret key for the active mode, or null when it isn't configured. */
export function stripeSecretKey(): string | null {
  const mode = stripeMode();
  const key = mode === "test"
    ? Deno.env.get("STRIPE_TEST_SECRET_KEY")
    : Deno.env.get("STRIPE_SECRET_KEY");
  return key && key.length > 0 ? key : null;
}
