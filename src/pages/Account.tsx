import { Navigate } from "react-router-dom";
import { CUSTOMER_ACCOUNT_ENABLED } from "@/lib/dashboard-config";

/**
 * /account — Customer account / dashboard entry point.
 *
 * Pre-launch: redirects to homepage (CUSTOMER_ACCOUNT_ENABLED = false).
 * Post-launch: this becomes the authenticated customer dashboard.
 *
 * Currently a placeholder. When enabled, swap the body for the real
 * authenticated dashboard (subscription status, upcoming visits, etc.).
 */
export default function Account() {
  if (!CUSTOMER_ACCOUNT_ENABLED) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-4 py-16">
        <h1
          className="text-3xl md:text-4xl font-black tracking-tight text-foreground"
          style={{ letterSpacing: "-0.03em" }}
        >
          Your account
        </h1>
        <p className="text-muted-foreground">
          Account dashboard coming soon.
        </p>
      </div>
    </div>
  );
}
