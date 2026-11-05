import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity, Inbox, BarChart3, Heart, FileText, Users, Megaphone, DollarSign,
  Bell, Power, Bot, BookOpen, Zap, Mail, CalendarDays, Award, ShieldCheck,
  ClipboardList, Gauge, Star, SlidersHorizontal, GraduationCap, PackageCheck,
  Shield, Menu, X, ChevronDown, BriefcaseBusiness, Landmark, Settings, MessageSquare,
  MapPin,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import CapacityBanner from "@/components/admin/CapacityBanner";
import AdminSearch from "@/components/admin/AdminSearch";
import AdminThemeToggle from "@/components/admin/AdminThemeToggle";
import { Button } from "@/components/ui/button";

import {ADMIN_GROUPS as GROUPS,ADMIN_LAUNCHERS} from '@/lib/admin-navigation';
const NAV = GROUPS.flatMap((group) => group.items);
const OPEN_KEY = "tidy.admin.nav-groups";

function relativeTime(iso: string | null) {
  if (!iso) return "—";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export default function AdminChrome() {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith("/admin");
  const [time, setTime] = useState(() => new Date());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [siteMode, setSiteMode] = useState<"loading" | "dark" | "waitlist" | "live">("loading");
  const currentGroup = useMemo(() => GROUPS.find((group) => group.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)))?.label, [pathname]);
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '["Today"]'); } catch { return ["Today"]; }
  });

  useEffect(() => {
    if (!isAdminRoute) return;
    document.body.classList.add("admin-hud");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setDrawerOpen(false);
    if (currentGroup) setOpenGroups((groups) => groups.includes(currentGroup) ? groups : [...groups, currentGroup]);
    return () => document.body.classList.remove("admin-hud");
  }, [isAdminRoute, pathname, currentGroup]);

  useEffect(() => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(openGroups)); } catch { /* unavailable */ } }, [openGroups]);
  useEffect(() => {
    if (!isAdminRoute) return;
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [isAdminRoute]);
  useEffect(() => {
    if (!isAdminRoute) return;
    let cancelled = false;
    const refresh = async () => {
      const [alerts, sync, site] = await Promise.all([
        supabase.from("admin_alerts").select("id", { count: "exact", head: true }).is("resolved_at", null),
        supabase.from("app_settings").select("value").eq("key", "sheets_master_sync_last_at").maybeSingle(),
        supabase.from("app_settings").select("value").eq("key", "site_live").maybeSingle(),
      ]);
      if (cancelled) return;
      setOpenAlerts(alerts.count ?? 0);
      const syncValue = sync.data?.value as { at?: string } | null;
      setLastSync(syncValue?.at ?? null);
      setSiteMode(site.error ? "dark" : site.data?.value === true ? "live" : "waitlist");
    };
    void refresh();
    const id = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isAdminRoute]);

  if (!isAdminRoute) return null;
  const toggleGroup = (label: string) => setOpenGroups((groups) => groups.includes(label) ? groups.filter((group) => group !== label) : [...groups, label]);
  const stamp = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const siteLabel = siteMode === "live" ? "LIVE" : siteMode === "waitlist" ? "WAITLIST" : siteMode === "dark" ? "UNKNOWN" : "···";

  const rail = (
    <nav className="admin-hud-rail" aria-label="Admin navigation">
      <div className="admin-hud-rail__brand"><span className="admin-hud-dot" /><span>TIDY</span></div>
      <div className="mb-4 grid gap-2">{ADMIN_LAUNCHERS.map(l=><Button asChild key={l.label} variant="outline" className="justify-start border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-deep hover:text-primary-foreground"><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a></Button>)}</div>
      {GROUPS.map((group) => {
        const open = openGroups.includes(group.label);
        const badge = group.items.reduce((sum, item) => sum + (item.badge === "alerts" ? openAlerts : 0), 0);
        const GroupIcon = group.icon;
        return <div className="admin-nav-group" key={group.label}>
          <Button type="button" variant="ghost" className="admin-nav-group__trigger" onClick={() => toggleGroup(group.label)} aria-expanded={open}>
            <GroupIcon className="h-5 w-5" /><span>{group.label}</span>{badge > 0 && <span className="admin-nav-badge">{badge}</span>}<ChevronDown className={`ml-auto h-5 w-5 ${open ? "rotate-180" : ""}`} />
          </Button>
          {open && <div className="admin-nav-group__items">{group.items.map(({ to, label, icon: Icon, badge: itemBadge }) => {
            const base=to.split('#')[0]; const active = pathname === base || pathname.startsWith(`${base}/`);
            return <Link key={to} to={to} className={`admin-hud-rail__item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
              <Icon className="h-5 w-5" /><span>{label}</span>{itemBadge === "alerts" && openAlerts > 0 && <span className="admin-nav-badge">{openAlerts}</span>}
            </Link>;
          })}</div>}
        </div>;
      })}
    </nav>
  );

  return <>
    <div className="admin-hud-bg" aria-hidden="true" />
    <CapacityBanner />
    <div className="admin-hud-topbar" role="status" aria-label="Admin status">
      <div className="admin-hud-topbar__left">
        <Button className="admin-mobile-menu" variant="ghost" size="icon" onClick={() => setDrawerOpen(true)} aria-label="Open admin navigation"><Menu className="h-5 w-5" /></Button>
        <span className="admin-hud-dot" /><span className="admin-hud-label">TIDY · COMMAND</span><span className="admin-hud-path">{pathname.replace("/admin", "ADMIN") || "ADMIN"}</span>
      </div>
      <div className="admin-hud-topbar__center"><AdminSearch nav={NAV.map(({ to, label }) => ({ to, label }))} /></div>
      <div className="admin-hud-topbar__right"><AdminThemeToggle active /><span className={`admin-status-chip is-${siteMode}`}><Shield className="h-3 w-3" />{siteLabel}</span><span className="admin-hud-meta">SYNC · {relativeTime(lastSync)}</span><span className="admin-hud-meta admin-hud-time">{stamp}</span></div>
    </div>
    {rail}
    {drawerOpen && <div className="admin-mobile-drawer"><Button variant="ghost" className="admin-mobile-backdrop rounded-none" onClick={() => setDrawerOpen(false)} aria-label="Close menu backdrop" /><div className="admin-mobile-panel"><Button variant="ghost" size="icon" className="admin-mobile-close" onClick={() => setDrawerOpen(false)} aria-label="Close admin navigation"><X className="h-5 w-5" /></Button>{rail}</div></div>}
  </>;
}