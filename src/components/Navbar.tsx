import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import TidyLogo from "./TidyLogo";
import LanguageToggle from "./LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { Menu, X } from "lucide-react";
import { pushEvent } from "@/lib/tracking";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";

interface NavbarProps {
  onOpenPopup: () => void;
}

const Navbar = ({ onOpenPopup }: NavbarProps) => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    setMenuOpen(false);
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  const links = [
    { label: "Services", href: "#services" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ];

  const ctaText = CUSTOMER_DASHBOARD_ENABLED ? "START MY PLAN" : "Request Early Access";

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 bg-background border-b transition-shadow duration-300 ${scrolled ? "shadow-md" : ""}`}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Left: Logo + hamburger menu */}
        <div className="flex items-center gap-3">
          <a href="#" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <TidyLogo size="md" />
          </a>
          <div className="relative">
            <button
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              {menuOpen ? <X className="w-5 h-5 text-foreground" /> : <Menu className="w-5 h-5 text-foreground" />}
            </button>

            {/* Dropdown menu */}
            {menuOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-card border rounded-xl shadow-lg py-2 animate-fade-in z-50">
                {links.map((l) => (
                  <button
                    key={l.href}
                    onClick={() => handleNavClick(l.href)}
                    className="block w-full text-left px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-primary transition-colors"
                  >
                    {t(l.label)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-4">
          <LanguageToggle />
          {CUSTOMER_DASHBOARD_ENABLED && (
            <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">
              Login
            </Link>
          )}
          <button
            id="cta-navbar"
            data-track="cta_navbar"
            onClick={() => { pushEvent("cta_click", { cta_id: "navbar", cta_text: ctaText }); onOpenPopup(); }}
            className="bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            {t(ctaText)}
          </button>
        </div>
      </div>

      {/* Close dropdown when clicking outside */}
      {menuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
      )}
    </nav>
  );
};

export default Navbar;
