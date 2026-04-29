/**
 * HomeButton — small floating "back to home" affordance present on every page.
 *
 * Mounted once globally in App.tsx. Self-hides on:
 *   - the homepage itself (`/`)
 *   - the multi-step dashboard plan builder & checkout flows, where bouncing
 *     to home mid-flow would lose user state
 *
 * Sits top-left, low z-index relative to modals (z-40) but above page content.
 * Same component for customers and admins — Justin asked for one home button
 * everywhere, including admin pages where the chatbot widget can otherwise
 * trap you with no obvious way back.
 */
import { Link, useLocation } from "react-router-dom";
import { Home } from "lucide-react";

const HIDE_ON_PREFIXES = [
  "/dashboard/plan",
  "/dashboard/confirmation",
  "/checkout",
  "/coming-soon",
];

export default function HomeButton() {
  const { pathname } = useLocation();

  if (pathname === "/") return null;
  if (HIDE_ON_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <Link
      to="/"
      aria-label="Back to home"
      title="Home"
      className="fixed top-3 left-3 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg ring-1 ring-border backdrop-blur transition-all hover:scale-105 hover:bg-background active:scale-95 print:hidden"
    >
      <Home className="h-5 w-5" />
    </Link>
  );
}
