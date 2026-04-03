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
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
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
        <a href="#" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <TidyLogo size="md" />
        </a>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6">
          {!CUSTOMER_DASHBOARD_ENABLED && links.map((l) => (
            <button key={l.href} onClick={() => handleNavClick(l.href)} className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
              {t(l.label)}
            </button>
          ))}
          <LanguageToggle />
          {CUSTOMER_DASHBOARD_ENABLED && (
            <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Login
            </Link>
          )}
          <button id="cta-navbar" data-track="cta_navbar" onClick={() => { pushEvent("cta_click", { cta_id: "navbar", cta_text: ctaText }); onOpenPopup(); }} className="bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
            {t(ctaText)}
          </button>
        </div>

        {/* Mobile toggle */}
        <div className="flex md:hidden items-center gap-2">
          <LanguageToggle />
          <button className="p-2" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-background border-t px-4 pb-4 animate-fade-up">
          {!CUSTOMER_DASHBOARD_ENABLED && links.map((l) => (
            <button key={l.href} onClick={() => handleNavClick(l.href)} className="block w-full text-left py-3 text-sm font-medium text-foreground/80 border-b border-border/50">
              {t(l.label)}
            </button>
          ))}
          {CUSTOMER_DASHBOARD_ENABLED && (
            <Link to="/login" onClick={() => setMobileOpen(false)} className="block w-full text-left py-3 text-sm font-medium text-foreground/80 border-b border-border/50">
              Login
            </Link>
          )}
          <button id="cta-navbar-mobile" data-track="cta_navbar_mobile" onClick={() => { setMobileOpen(false); pushEvent("cta_click", { cta_id: "navbar_mobile", cta_text: ctaText }); onOpenPopup(); }} className="w-full mt-3 bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors">
            {t(ctaText)}
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
