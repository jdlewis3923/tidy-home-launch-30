import { useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import TidyLogo from "./TidyLogo";
import LanguageToggle from "./LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { Menu, X } from "lucide-react";
import { pushEvent } from "@/lib/tracking";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";

interface NavbarProps {
  onOpenPopup: () => void;
}

// Route-based primary nav. Same set on every page (homepage + LPs + bundle).
const NAV_ITEMS = [
  { label: "Home", to: "/" },
  { label: "House Cleaning", to: "/house-cleaning" },
  { label: "Lawn Care", to: "/lawn-care" },
  { label: "Car Detailing", to: "/car-detailing" },
  { label: "Bundle & Save", to: "/bundle" },
  { label: "Refer", to: "/referral" },
];

const Navbar = ({ onOpenPopup }: NavbarProps) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLanguage();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menus on route change.
  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  const ctaText = CUSTOMER_DASHBOARD_ENABLED ? "START MY PLAN" : "Request Early Access";

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${
      isActive ? "text-primary" : "text-foreground/80 hover:text-primary"
    }`;

  // --- DASHBOARD ON: hamburger dropdown + Login + START MY PLAN ---
  if (CUSTOMER_DASHBOARD_ENABLED) {
    return (
      <nav className={`fixed top-0 left-0 right-0 z-50 bg-background border-b transition-shadow duration-300 ${scrolled ? "shadow-md" : ""}`}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" aria-label="Tidy home">
              <TidyLogo size="md" />
            </Link>
            <div className="relative">
              <button className="p-2 rounded-lg hover:bg-muted transition-colors" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
                {menuOpen ? <X className="w-5 h-5 text-foreground" /> : <Menu className="w-5 h-5 text-foreground" />}
              </button>
              {menuOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-card border rounded-xl shadow-lg py-2 animate-fade-in z-50">
                  {NAV_ITEMS.map((l) => (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      end={l.to === "/"}
                      className={({ isActive }) =>
                        `block w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                          isActive ? "text-primary bg-muted" : "text-foreground/80 hover:bg-muted hover:text-primary"
                        }`
                      }
                    >
                      {t(l.label)}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">
              Login
            </Link>
            <button id="cta-navbar" data-track="cta_navbar" onClick={() => { pushEvent("cta_click", { cta_id: "navbar", cta_text: ctaText }); onOpenPopup(); }} className="bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
              {t(ctaText)}
            </button>
          </div>
        </div>
        {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />}
      </nav>
    );
  }

  // --- DASHBOARD OFF: pre-launch navbar with route-based links ---
  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 bg-background border-b transition-shadow duration-300 ${scrolled ? "shadow-md" : ""}`}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" aria-label="Tidy home">
          <TidyLogo size="md" />
        </Link>

        {/* Desktop */}
        <div className="hidden lg:flex items-center gap-5">
          {NAV_ITEMS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"} className={navLinkClass}>
              {t(l.label)}
            </NavLink>
          ))}
          <LanguageToggle />
          <button id="cta-navbar" data-track="cta_navbar" onClick={() => { pushEvent("cta_click", { cta_id: "navbar", cta_text: ctaText }); onOpenPopup(); }} className="bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
            {t(ctaText)}
          </button>
        </div>

        {/* Mobile toggle */}
        <div className="flex lg:hidden items-center gap-2">
          <LanguageToggle />
          <button className="p-2" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open menu">
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-background border-t px-4 pb-4 animate-fade-up">
          {NAV_ITEMS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `block w-full text-left py-3 text-sm font-medium border-b border-border/50 ${
                  isActive ? "text-primary" : "text-foreground/80"
                }`
              }
            >
              {t(l.label)}
            </NavLink>
          ))}
          <button id="cta-navbar-mobile" data-track="cta_navbar_mobile" onClick={() => { setMobileOpen(false); pushEvent("cta_click", { cta_id: "navbar_mobile", cta_text: ctaText }); onOpenPopup(); }} className="w-full mt-3 bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors">
            {t(ctaText)}
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
