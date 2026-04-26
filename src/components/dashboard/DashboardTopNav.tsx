/**
 * Tidy — Dashboard top navigation.
 *
 * Calm, white-on-cream nav matching the reference: logo left, primary
 * sections center (Dashboard active), notification bell + avatar right.
 * Replaces the marketing-style DashboardNavbar inside the customer
 * command center.
 */
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Bell, ChevronDown } from 'lucide-react';
import tidyLogo from '@/assets/tidy-logo.png';
import { supabase } from '@/integrations/supabase/client';

const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Services', href: '/dashboard/plan' },
  { label: 'Billing', href: '/billing' },
  { label: 'Account', href: '/account' },
  { label: 'Help', href: '/dashboard#help' },
];

export default function DashboardTopNav({ initials = 'AK' }: { initials?: string }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [hasUnread] = useState(true);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-[hsl(var(--hairline))]/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-3">
        <Link to="/dashboard" className="flex items-center">
          <img
            src={tidyLogo}
            alt="Tidy"
            className="h-16 w-auto drop-shadow-[0_4px_14px_rgba(15,23,42,0.12)]"
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => {
            const active =
              item.href === '/dashboard'
                ? location.pathname === '/dashboard'
                : location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.label}
                to={item.href}
                className={`relative text-sm font-medium tracking-tight transition-colors ${
                  active
                    ? 'text-[hsl(var(--primary))]'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute -bottom-[14px] left-0 right-0 h-[2px] rounded-full bg-[hsl(var(--primary))]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Notifications"
            className="relative grid h-10 w-10 place-items-center rounded-full text-ink-soft transition hover:bg-cream"
          >
            <Bell className="h-5 w-5" />
            {hasUnread && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[hsl(var(--primary))] ring-2 ring-white" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-cream"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--primary))]/10 text-sm font-semibold text-[hsl(var(--primary))]">
              {initials}
            </span>
            <ChevronDown className="h-4 w-4 text-ink-faint" />
          </button>

          {open && (
            <div className="absolute right-6 top-16 w-48 rounded-xl border border-[hsl(var(--hairline))] bg-white p-2 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)]">
              <Link
                to="/account"
                className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-cream"
              >
                Account
              </Link>
              <Link
                to="/billing"
                className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-cream"
              >
                Billing
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = '/';
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
