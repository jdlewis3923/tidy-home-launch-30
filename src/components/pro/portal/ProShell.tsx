/**
 * Tidy Pro Portal shell — top app bar (with its own in-app back control so the
 * app works in standalone PWA mode with no browser chrome) and the bottom nav
 * shown on every authenticated screen.
 */
import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ProHead, { ProMark } from "./ProHead";
import LanguageSheet from "./LanguageSheet";
import { ArrowLeft, Bell, CalendarDays, CircleUser, DollarSign, Home, Trophy } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const NAV = [
  { to: "/pro/home", label: "Home", es: "Inicio", icon: Home },
  { to: "/pro/schedule", label: "Schedule", es: "Agenda", icon: CalendarDays },
  { to: "/pro/earnings", label: "Earnings", es: "Pagos", icon: DollarSign },
  { to: "/pro/status", label: "Status", es: "Estado", icon: Trophy },
  { to: "/pro/profile", label: "Profile", es: "Perfil", icon: CircleUser },
];

export function ProTopBar({
  title,
  back,
  showBell = false,
  unread = 0,
  hideTitle = false,
}: {
  title: string;
  hideTitle?: boolean;
  back?: string;
  showBell?: boolean;
  unread?: number;
}) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [sheet, setSheet] = useState(false);
  const es = language === "es";
  return (
    <header className="sticky top-0 z-30 bg-[hsl(var(--pro-deep))] px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] text-primary-foreground">
      <div className="relative flex min-h-[48px] items-center gap-1.5">
        {back !== undefined ? (
          <button type="button" aria-label={es ? "Atrás" : "Back"} onClick={() => (back ? navigate(back) : navigate(-1))}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-primary-foreground/10">
            <ArrowLeft className="h-5 w-5" aria-hidden strokeWidth={2} />
          </button>
        ) : <ProMark size={36} className="ml-0.5 mr-1" />}
        <h1 className={`flex-1 truncate text-[19px] font-semibold tracking-[-0.01em] ${hideTitle ? "sr-only" : ""}`}>{title}</h1>{hideTitle && <span className="flex-1" />}
        <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog"
          aria-label={es ? "Idioma: Español" : "Language: English"}
          className="grid h-11 min-w-[44px] place-items-center rounded-full px-2 text-[14px] font-medium active:bg-primary-foreground/10">
          {es ? "EN" : "ES"}
        </button>
        {showBell && (
          <Link to="/pro/notifications"
            aria-label={es ? (unread ? `${unread} notificaciones sin leer` : "Notificaciones") : (unread ? `${unread} unread notifications` : "Notifications")}
            className="relative grid h-11 w-11 place-items-center rounded-full active:bg-primary-foreground/10">
            <Bell className="h-[22px] w-[22px]" aria-hidden strokeWidth={1.9} />
            {unread > 0 && <span className="absolute right-[11px] top-[10px] h-2 w-2 rounded-full bg-[hsl(var(--pro-red))] ring-2 ring-[hsl(var(--pro-deep))]" />}
          </Link>
        )}
      </div>
      <LanguageSheet open={sheet} onClose={() => setSheet(false)} />
    </header>
  );
}

export function ProBottomNav() {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[hsl(var(--pro-line))] bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {NAV.map(({ to, label, es, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`) || (to === "/pro/schedule" && pathname.startsWith("/pro/visit"));
          return (
            <li key={to} className="flex-1">
              <Link to={to} aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[62px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors duration-150 ${active ? "text-[hsl(var(--pro-blue))]" : "text-[hsl(var(--pro-ink-soft))]"}`}>
                <span aria-hidden className={`absolute top-0 h-[2.5px] w-9 rounded-b-full bg-[hsl(var(--pro-blue))] transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`} />
                <Icon className="h-[21px] w-[21px]" aria-hidden strokeWidth={active ? 2.2 : 1.7} />
                {language === "es" ? es : label}
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
  dark = false,
  hideTitle = false,
}: {
  hideTitle?: boolean;
  title: string;
  back?: string;
  showBell?: boolean;
  unread?: number;
  children: ReactNode;
  nav?: boolean;
  /** Navy page ground (mockup home); other screens keep the light ground. */
  dark?: boolean;
}) {
  return (
    <div className={`min-h-screen font-sans ${dark ? "bg-[hsl(var(--pro-deep))]" : "bg-[hsl(var(--pro-ground))]"}`}>
      <ProHead title={`${title} · Tidy Pro Portal`} />
      <ProTopBar title={title} back={back} showBell={showBell} unread={unread} hideTitle={hideTitle} />
      <main className={`mx-auto max-w-md ${nav ? "pb-24" : "pb-10"}`}>{children}</main>
      {nav && <ProBottomNav />}
    </div>
  );
}
