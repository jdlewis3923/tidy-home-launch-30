import TidyLogo from "./TidyLogo";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Instagram, Facebook, Music2 } from "lucide-react";

const Footer = () => {
  const { t } = useLanguage();
  return (
    <footer className="bg-navy-deep py-16 px-4">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-12">
        <div>
          <TidyLogo size="md" withBackground />
          <p className="text-primary-foreground/50 text-sm mt-4 leading-relaxed">
            Miami's subscription home service. House cleaning, lawn care, and car detailing — one simple monthly plan. Serving Kendall + Pinecrest — 33156 · 33183 · 33186.
          </p>
          <p className="text-primary-foreground/40 text-sm mt-4">
            <a href="mailto:hello@jointidy.co" className="hover:text-primary transition-colors">hello@jointidy.co</a>
            <br />
            <a href="https://jointidy.co" className="hover:text-primary transition-colors">jointidy.co</a>
            <br />Miami, Florida
          </p>
          <div className="flex gap-3 mt-4 items-center">
            <a
              href="https://instagram.com/jointidy"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Tidy on Instagram"
              className="text-primary-foreground/40 hover:text-primary transition-colors"
            >
              <Instagram className="w-5 h-5" />
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=1070497002814326"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Tidy on Facebook"
              className="text-primary-foreground/40 hover:text-primary transition-colors"
            >
              <Facebook className="w-5 h-5" />
            </a>
            <span
              title="Coming soon"
              aria-label="TikTok coming soon"
              className="relative inline-flex items-center text-primary-foreground/30 opacity-60 cursor-default group"
            >
              <Music2 className="w-5 h-5" />
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-7 whitespace-nowrap rounded bg-primary-foreground/10 px-2 py-0.5 text-[10px] text-primary-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity">
                Coming soon
              </span>
            </span>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-primary-foreground mb-4">{t("Services")}</h4>
          <ul className="space-y-2 text-sm text-primary-foreground/40">
            <li><Link to="/house-cleaning" className="hover:text-primary-foreground/70 transition-colors">{t("House Cleaning Miami")}</Link></li>
            <li><Link to="/lawn-care" className="hover:text-primary-foreground/70 transition-colors">{t("Lawn Care Miami")}</Link></li>
            <li><Link to="/car-detailing" className="hover:text-primary-foreground/70 transition-colors">{t("Car Detailing Miami")}</Link></li>
            <li><Link to="/bundle" className="hover:text-primary-foreground/70 transition-colors">Bundle &amp; Save</Link></li>
            <li><a href="#pricing" className="hover:text-primary-foreground/70 transition-colors">{t("Pricing")}</a></li>
            <li><Link to="/refer" className="hover:text-primary-foreground/70 transition-colors">{t("Referral Program")}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-primary-foreground mb-4">{t("Company")}</h4>
          <ul className="space-y-2 text-sm text-primary-foreground/40">
            <li><a href="#how-it-works" className="hover:text-primary-foreground/70 transition-colors">{t("How It Works")}</a></li>
            <li><a href="#faq" className="hover:text-primary-foreground/70 transition-colors">{t("FAQ")}</a></li>
            <li>{t("Service Areas")}</li>
            <li><Link to="/terms" className="hover:text-primary-foreground/70 transition-colors">{t("Terms of Service")}</Link></li>
            <li><Link to="/privacy" className="hover:text-primary-foreground/70 transition-colors">{t("Privacy Policy")}</Link></li>
            <li><a href="mailto:hello@jointidy.co" className="hover:text-primary-foreground/70 transition-colors">{t("Contact Us")}</a></li>
            <li><Link to="/apply" className="hover:text-primary-foreground/70 transition-colors">Careers — Apply to Work With Us</Link></li>
          </ul>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-primary-foreground/10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-primary-foreground/30">
          <p>© 2026 Tidy Home Concierge LLC. All rights reserved. Miami, Florida. hello@jointidy.co</p>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-primary-foreground/50 transition-colors">{t("Terms")}</Link>
            <Link to="/privacy" className="hover:text-primary-foreground/50 transition-colors">{t("Privacy")}</Link>
            <a href="#faq" className="hover:text-primary-foreground/50 transition-colors">{t("FAQ")}</a>
          </div>
        </div>
        <p className="text-[10px] text-primary-foreground/20 mt-4 text-center">
          Serving 33183 Kendall · 33186 Kendall West · 33156 Pinecrest with recurring house cleaning, lawn care, and car detailing subscriptions.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
