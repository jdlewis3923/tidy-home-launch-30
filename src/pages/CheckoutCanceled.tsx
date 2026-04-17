import { Link } from "react-router-dom";

/**
 * /checkout/canceled — Stripe redirects here when a customer abandons
 * checkout. Always available so external returns never 404.
 */
export default function CheckoutCanceled() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-xl w-full text-center space-y-6 py-16">
        <h1
          className="text-3xl md:text-4xl font-black tracking-tight text-foreground"
          style={{ letterSpacing: "-0.03em" }}
        >
          Checkout canceled
        </h1>
        <p className="text-muted-foreground">
          No charge was made. You can pick up where you left off whenever you're ready.
        </p>
        <Link
          to="/"
          className="inline-block rounded-lg border border-border px-6 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
        >
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
