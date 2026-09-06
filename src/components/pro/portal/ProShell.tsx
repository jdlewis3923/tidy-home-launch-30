/**
 * Tidy Pro Portal shell — top app bar (with its own in-app back control so the
 * app works in standalone PWA mode with no browser chrome) and the bottom nav
 * shown on every authenticated screen.
 */
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ProHead, { ProMark } from "./ProHead";
import { ArrowLeft, Bell, CalendarDays, CircleUser, DollarSign, Trophy } from "lucide-react";
import barBackdrop from "@/assets/miami-waterfront.webp";

const NAV = [
  { to: "/pro/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/pro/earnings", label: "Earnings", icon: DollarSign },
  { to: "/pro/status", label: "Status", icon: Trophy },
  { to: "/pro/profile", label: "Profile", icon: CircleUser },
];

export function ProTopBar({
  title,
  back,
  showBell = false,
  unread = 0,
}: {
  title: string;
  back?: string;
  showBell?: boolean;
  unread?: number;
}) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 overflow-hidden bg-[hsl(var(--pro-navy))] px-2 pb-2.5 pt-[max(0.6rem,env(safe-area-inset-top))] text-white">
      <img src={barBackdrop} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.22]" />
      <div className="pointer-events-none absolute inset-0 pro-hero-texture opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[hsl(var(--pro-navy)/0.55)] to-[hsl(var(--pro-navy)/0.92)]" />
      <div className="relative flex min-h-[48px] items-center gap-1">
        {back !== undefined && (
          <button
            type="button"
            aria-label="Back"
            onClick={() => (back ? navigate(back) : navigate(-1))}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden strokeWidth={2} />
          </button>
        )}
        {back === undefined && <ProMark size={30} className="ml-2 mr-1" />}
        <h1
          className={`flex-1 truncate text-[18px] font-bold tracking-[-0.02em] ${back === undefined ? "pl-1" : ""}`}
        >
          {title}
        </h1>
        {showBell && (
          <Link
            to="/pro/notifications"
            aria-label={unread ? `${unread} unread notifications` : "Notifications"}
            className="relative grid h-11 w-11 place-items-center rounded-full active:bg-white/10"
          >
            <Bell className="h-5 w-5" aria-hidden strokeWidth={1.9} />
            {unread > 0 && (
              <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-[hsl(var(--pro-gold))] ring-2 ring-[hsl(var(--pro-navy))]" />
            )}
          </Link>
        )}
      </div>
    </header>
  );
}

export function ProBottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[hsl(var(--pro-navy)/0.08)] bg-white/92 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[68px] flex-col items-center justify-center gap-1 pt-1.5 text-[11px] font-bold tracking-[-0.01em] ${
                  active ? "text-[hsl(var(--pro-blue))]" : "text-[hsl(var(--pro-ink-soft))]"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-0 h-[3px] w-8 rounded-full transition-opacity ${
                    active ? "bg-[hsl(var(--pro-blue))] opacity-100" : "opacity-0"
                  }`}
                />
                <Icon className="h-[22px] w-[22px]" aria-hidden strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}


export default function ProShell({
  title,
  back,
  showBell,
  unread,
  children,
  nav = true,
}: {
  title: string;
  back?: string;
  showBell?: boolean;
  unread?: number;
  children: ReactNode;
  nav?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[hsl(var(--pro-ground))] font-sans">
      <ProHead title={`${title} · Tidy Pro Portal`} />
      <ProTopBar title={title} back={back} showBell={showBell} unread={unread} />
      <main className={`mx-auto max-w-md ${nav ? "pb-28" : "pb-10"}`}>{children}</main>
      {nav && <ProBottomNav />}
    </div>
  );
}
