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
    <header className="sticky top-0 z-30 overflow-hidden bg-[hsl(var(--pro-navy))] px-2 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
      <img src={barBackdrop} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[hsl(var(--pro-navy)/0.7)] to-[hsl(var(--pro-navy)/0.95)]" />
      <div className="relative flex min-h-[48px] items-center gap-1">
        {back !== undefined && (
          <button
            type="button"
            aria-label="Back"
            onClick={() => (back ? navigate(back) : navigate(-1))}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
        )}
        {back === undefined && <ProMark size={30} className="ml-2 mr-1" />}
        <h1 className={`flex-1 truncate text-[18px] font-extrabold ${back === undefined ? "pl-1" : ""}`}>
          {title}
        </h1>
        {showBell && (
          <Link
            to="/pro/notifications"
            aria-label={unread ? `${unread} unread notifications` : "Notifications"}
            className="relative grid h-11 w-11 place-items-center rounded-full active:bg-white/10"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {unread > 0 && (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[hsl(var(--pro-sky))]" />
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
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[hsl(var(--pro-line))] bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-bold ${
                  active ? "text-[hsl(var(--pro-blue))]" : "text-[hsl(var(--pro-ink-soft))]"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden strokeWidth={active ? 2.4 : 1.9} />
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
