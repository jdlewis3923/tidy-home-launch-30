import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  Activity, Inbox, BarChart3, Heart, FileText, Users,
  Megaphone, DollarSign, Bell, Power, Bot, BookOpen, Zap,
} from "lucide-react";

/**
 * AdminChrome — Iron-Man HUD shell injected on every /admin/* route.
 *
 * Renders ONLY a fixed ambient background + a slim top status rail + a
 * floating side nav rail. It does NOT wrap page content (zero risk to
 * existing layouts) — pages still render normally on top, they just get
 * a far cooler canvas.
 *
 * Brand-aligned: navy-deep base, primary blue + gold accents, restrained motion.
 */

const NAV = [
  { to: "/admin/kpis",        label: "KPIs",        icon: BarChart3 },
  { to: "/admin/health",      label: "Health",      icon: Heart },
  { to: "/admin/inbox",       label: "Inbox",       icon: Inbox },
  { to: "/admin/applicants",  label: "Applicants",  icon: Users },
  { to: "/admin/documents",   label: "Docs",        icon: FileText },
  { to: "/admin/schedule",    label: "Schedule",    icon: Megaphone },
  { to: "/admin/agents",      label: "Agents",      icon: Bot },
  { to: "/admin/costs",       label: "Costs",       icon: DollarSign },
  { to: "/admin/site-status", label: "Site",        icon: Power },
  { to: "/admin/chatbot-knowledge", label: "Chatbot", icon: BookOpen },
  { to: "/admin/settings/notifications", label: "Alerts", icon: Bell },
  { to: "/admin/test-zapier", label: "Zapier",      icon: Zap },
];

export default function AdminChrome() {
  const { pathname } = useLocation();
  const [time, setTime] = useState(() => new Date());
  const isAdminRoute = pathname.startsWith("/admin");

  useEffect(() => {
    if (!isAdminRoute) return;
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [isAdminRoute]);

  // Toggle a body class so CSS can re-skin admin surfaces site-wide
  useEffect(() => {
    if (isAdminRoute) {
      document.body.classList.add("admin-hud");
    } else {
      document.body.classList.remove("admin-hud");
    }
    return () => document.body.classList.remove("admin-hud");
  }, [isAdminRoute]);

  if (!isAdminRoute) return null;

  const stamp = time.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  return (
    <>
      {/* === Fixed ambient HUD background === */}
      <div className="admin-hud-bg" aria-hidden="true">
        <div className="admin-hud-grid" />
        <div className="admin-hud-glow admin-hud-glow--blue" />
        <div className="admin-hud-glow admin-hud-glow--gold" />
        <div className="admin-hud-scanline" />
        <div className="admin-hud-vignette" />
      </div>

      {/* === Slim top status rail === */}
      <div className="admin-hud-topbar" role="status" aria-label="Admin status">
        <div className="admin-hud-topbar__left">
          <span className="admin-hud-dot" />
          <span className="admin-hud-label">TIDY · COMMAND</span>
          <span className="admin-hud-divider" />
          <span className="admin-hud-path">{pathname.replace("/admin", "ADMIN") || "ADMIN"}</span>
        </div>
        <div className="admin-hud-topbar__right">
          <span className="admin-hud-meta">SYS</span>
          <Activity className="h-3 w-3 text-[hsl(var(--gold))]" />
          <span className="admin-hud-meta">·</span>
          <span className="admin-hud-meta admin-hud-time">{stamp}</span>
          <span className="admin-hud-meta">UTC-5</span>
        </div>
      </div>

      {/* === Floating left nav rail (desktop only) === */}
      <nav className="admin-hud-rail" aria-label="Admin navigation">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={`admin-hud-rail__item ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              <span className="admin-hud-rail__label">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
