import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import tidyLogo from '@/assets/tidy-logo.png';

export default function DashboardNavbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isOnPlan = location.pathname === '/dashboard/plan';

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
        <Link to="/dashboard" className="flex items-center"><img src={tidyLogo} alt="Tidy" className="h-[72px] w-auto" /></Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6">
          <a href="/dashboard#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
          <a href="/dashboard#services" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Services</a>
          <a href="/dashboard#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          <a href="/dashboard#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
          {!isOnPlan && (
            <Link
              to="/dashboard/plan"
              className="rounded-lg bg-gradient-to-br from-primary-deep to-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:shadow-xl transition-all"
            >
              Get Started →
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button type="button" onClick={() => setOpen(!open)} className="md:hidden p-2 text-foreground">
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border bg-card px-4 pb-4 space-y-3">
          <a href="/dashboard#how-it-works" className="block text-sm font-medium text-muted-foreground py-2">How It Works</a>
          <a href="/dashboard#services" className="block text-sm font-medium text-muted-foreground py-2">Services</a>
          <a href="/dashboard#pricing" className="block text-sm font-medium text-muted-foreground py-2">Pricing</a>
          <a href="/dashboard#faq" className="block text-sm font-medium text-muted-foreground py-2">FAQ</a>
          {!isOnPlan && (
            <Link
              to="/dashboard/plan"
              onClick={() => setOpen(false)}
              className="block w-full text-center rounded-lg bg-gradient-to-r from-gold/80 to-gold px-5 py-3 text-sm font-extrabold text-foreground shadow-md"
            >
              Get Started
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
