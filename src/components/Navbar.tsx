import { useState, useEffect } from "react";
import TidyLogo from "./TidyLogo";
import { Menu, X } from "lucide-react";

interface NavbarProps {
  onOpenPopup: () => void;
}

const Navbar = ({ onOpenPopup }: NavbarProps) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const links = [
    { label: "Services", href: "#services" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ];

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 bg-background border-b transition-shadow duration-300 ${scrolled ? "shadow-md" : ""}`}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <a href="#" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <TidyLogo size="sm" />
        </a>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <button key={l.href} onClick={() => handleNavClick(l.href)} className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
              {l.label}
            </button>
          ))}
          <button onClick={onOpenPopup} className="bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
            Request Early Access
          </button>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-background border-t px-4 pb-4 animate-fade-up">
          {links.map((l) => (
            <button key={l.href} onClick={() => handleNavClick(l.href)} className="block w-full text-left py-3 text-sm font-medium text-foreground/80 border-b border-border/50">
              {l.label}
            </button>
          ))}
          <button onClick={() => { setMobileOpen(false); onOpenPopup(); }} className="w-full mt-3 bg-gold hover:bg-gold/90 text-gold-foreground font-semibold px-5 py-3 rounded-lg text-sm transition-colors">
            Request Early Access
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
