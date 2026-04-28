/**
 * Tidy — Dashboard top navigation.
 *
 * Calm, white-on-cream nav matching the reference: logo left, primary
 * sections center (Dashboard active), notification bell + avatar right.
 *
 * Mobile (< md): hamburger menu opens a sheet exposing all customer links
 * AND, for admins, a clearly-labelled "Admin tools" section so admin users
 * can toggle between their customer dashboard and admin pages from any
 * device. Avatar pill also shows an Admin badge on mobile so the role is
 * obvious at a glance.
 */
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Bell, ChevronDown, Inbox, Calendar, FlaskConical, Gauge, Menu, X } from 'lucide-react';
import tidyLogo from '@/assets/tidy-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { useHasRoleState } from '@/hooks/useHasRole';

const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Services', href: '/dashboard/plan' },
  { label: 'Billing', href: '/billing' },
  { label: 'Notifications', href: '/dashboard/notifications' },
  { label: 'Account', href: '/account' },
  { label: 'Help', href: '/help' },
];

const ADMIN_NAV = [
  { label: 'KPI Center', href: '/admin/kpis', icon: Gauge },
  { label: 'Inbox', href: '/admin/inbox', icon: Inbox },
  { label: 'Schedule', href: '/admin/schedule', icon: Calendar },
  { label: 'Test events', href: '/admin/test-zapier', icon: FlaskConical },
];

export default function DashboardTopNav({ initials = '' }: { initials?: string }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hasUnread] = useState(true);
  const { hasRole: isAdmin, isLoading: roleLoading } = useHasRoleState('admin');

  useEffect(() => {
    setOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-[hsl(var(--hairline))]/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-3 sm:px-6">
        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden -ml-2 grid h-10 w-10 place-items-center rounded-full text-ink-soft transition hover:bg-cream"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link to="/dashboard" className="flex items-center">
          <img
            src={tidyLogo}
            alt="Tidy"
            className="h-12 w-auto sm:h-16 drop-shadow-[0_4px_14px_rgba(15,23,42,0.12)]"
          />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
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

          {isAdmin && (
            <>
              <span
                aria-hidden
                className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint"
              >
                <span className="h-px w-4 bg-[hsl(var(--hairline))]" />
                Admin
                <span className="h-px w-4 bg-[hsl(var(--hairline))]" />
              </span>
              {ADMIN_NAV.map((item) => {
                const active = location.pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    to={item.href}
                    className={`relative inline-flex items-center gap-1.5 text-sm font-medium tracking-tight transition-colors ${
                      active
                        ? 'text-[hsl(var(--primary))]'
                        : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {active && (
                      <span className="absolute -bottom-[14px] left-0 right-0 h-[2px] rounded-full bg-[hsl(var(--primary))]" />
                    )}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
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
              {initials || <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--primary))]/40" />}
            </span>
            {isAdmin && (
              <span className="inline-flex items-center rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/20">
                Admin
              </span>
            )}
            <ChevronDown className="hidden sm:block h-4 w-4 text-ink-faint" />
          </button>

          {open && (
            <div className="absolute right-4 top-16 z-50 w-48 rounded-xl border border-[hsl(var(--hairline))] bg-white p-2 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)] sm:right-6">
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

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[hsl(var(--hairline))]/70 bg-white">
          <nav className="mx-auto max-w-[1280px] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint mb-2">
              Customer
            </div>
            <div className="flex flex-col">
              {NAV.map((item) => {
                const active =
                  item.href === '/dashboard'
                    ? location.pathname === '/dashboard'
                    : location.pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.label}
                    to={item.href}
                    className={`rounded-lg px-3 py-3 text-sm font-medium transition ${
                      active
                        ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                        : 'text-ink hover:bg-cream'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {roleLoading && (
              <div className="mt-4 px-3 py-2 text-xs text-ink-faint">Loading…</div>
            )}

            {!roleLoading && isAdmin && (
              <>
                <div className="mt-5 mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                  <span className="h-px flex-1 bg-[hsl(var(--hairline))]" />
                  Admin tools
                  <span className="h-px flex-1 bg-[hsl(var(--hairline))]" />
                </div>
                <div className="flex flex-col">
                  {ADMIN_NAV.map((item) => {
                    const active = location.pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.label}
                        to={item.href}
                        className={`flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium transition ${
                          active
                            ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                            : 'text-ink hover:bg-cream'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/';
              }}
              className="mt-5 w-full rounded-lg border border-[hsl(var(--hairline))] px-3 py-3 text-left text-sm font-medium text-ink hover:bg-cream"
            >
              Sign out
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
