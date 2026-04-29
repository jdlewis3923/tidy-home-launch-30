import TidyLogo from "./TidyLogo";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Instagram, Facebook, Music2, Mail, MapPin, ArrowUpRight } from "lucide-react";

const ZIPS = [
  { code: "33156", area: "Pinecrest" },
  { code: "33183", area: "Kendall" },
  { code: "33186", area: "Kendall West" },
];

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="relative bg-navy-deep text-primary-foreground overflow-hidden">
      {/* Ambient brand glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-32 h-[420px] w-[420px] rounded-full opacity-25 blur-3xl"
             style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.6), transparent 60%)" }} />
        <div className="absolute -bottom-32 -right-32 h-[360px] w-[360px] rounded-full opacity-20 blur-3xl"
             style={{ background: "radial-gradient(circle, hsl(var(--gold)/0.55), transparent 60%)" }} />
      </div>

      {/* Top hairline accent */}
      <div className="relative h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-10">
        {/* TOP: brand + columns */}
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12">
          {/* Brand block */}
          <div className="lg:col-span-5">
            <TidyLogo size="md" withBackground />
            <p className="mt-5 text-primary-foreground/65 text-sm leading-relaxed max-w-md">
              Miami's subscription home service. House cleaning, lawn care, and car detailing —
              one simple monthly plan. Serving Kendall + Pinecrest.
            </p>

            {/* Service-area chips */}
            <div className="mt-5 flex flex-wrap gap-2">
              {ZIPS.map((z) => (
                <span
                  key={z.code}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/10 px-3 py-1 text-xs text-primary-foreground/70"
                >
                  <MapPin className="h-3 w-3 text-gold" />
                  <span className="font-semibold text-primary-foreground/85">{z.code}</span>
                  <span className="text-primary-foreground/45">· {z.area}</span>
                </span>
              ))}
            </div>

            {/* Contact */}
            <div className="mt-6 space-y-1.5 text-sm">
              <a
                href="mailto:hello@jointidy.co"
                className="inline-flex items-center gap-2 text-primary-foreground/70 hover:text-gold transition"
              >
                <Mail className="h-4 w-4" /> hello@jointidy.co
              </a>
              <a
                href="https://jointidy.co"
                className="flex items-center gap-2 text-primary-foreground/70 hover:text-gold transition"
              >
                <ArrowUpRight className="h-4 w-4" /> jointidy.co
              </a>
              <p className="text-primary-foreground/45 text-xs pt-1">Miami, Florida</p>
            </div>

            {/* Social */}
            <div className="mt-6 flex gap-2 items-center">
              <a
                href="https://instagram.com/jointidy"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Tidy on Instagram"
                className="h-9 w-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-primary-foreground/70 hover:text-gold hover:border-gold/40 hover:bg-white/[0.1] transition"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=1070497002814326"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Tidy on Facebook"
                className="h-9 w-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-primary-foreground/70 hover:text-gold hover:border-gold/40 hover:bg-white/[0.1] transition"
              >
                <Facebook className="w-4 h-4" />
              </a>
              <span
                title="Coming soon"
                aria-label="TikTok coming soon"
                className="relative h-9 w-9 rounded-full bg-white/[0.04] border border-white/5 flex items-center justify-center text-primary-foreground/30 cursor-default group"
              >
                <Music2 className="w-4 h-4" />
                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 whitespace-nowrap rounded bg-white/10 px-2 py-0.5 text-[10px] text-primary-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity">
                  Coming soon
                </span>
              </span>
            </div>
          </div>

          {/* Services column */}
          <div className="lg:col-span-3">
            <h4 className="text-[11px] font-bold tracking-[0.16em] uppercase text-gold/90 mb-5">
              {t("Services")}
            </h4>
            <ul className="space-y-3 text-sm text-primary-foreground/60">
              <li><Link to="/house-cleaning" className="hover:text-primary-foreground transition-colors">{t("House Cleaning Miami")}</Link></li>
              <li><Link to="/lawn-care" className="hover:text-primary-foreground transition-colors">{t("Lawn Care Miami")}</Link></li>
              <li><Link to="/car-detailing" className="hover:text-primary-foreground transition-colors">{t("Car Detailing Miami")}</Link></li>
              <li><Link to="/bundle" className="hover:text-primary-foreground transition-colors">Bundle &amp; Save</Link></li>
              <li><a href="#pricing" className="hover:text-primary-foreground transition-colors">{t("Pricing")}</a></li>
              <li><Link to="/refer" className="hover:text-primary-foreground transition-colors">{t("Referral Program")}</Link></li>
            </ul>
          </div>

          {/* Company column */}
          <div className="lg:col-span-4">
            <h4 className="text-[11px] font-bold tracking-[0.16em] uppercase text-gold/90 mb-5">
              {t("Company")}
            </h4>
            <ul className="space-y-3 text-sm text-primary-foreground/60">
              <li><a href="#how-it-works" className="hover:text-primary-foreground transition-colors">{t("How It Works")}</a></li>
              <li><a href="#faq" className="hover:text-primary-foreground transition-colors">{t("FAQ")}</a></li>
              <li className="text-primary-foreground/45">{t("Service Areas")}: 33156 · 33183 · 33186</li>
              <li><Link to="/terms" className="hover:text-primary-foreground transition-colors">{t("Terms of Service")}</Link></li>
              <li><Link to="/privacy" className="hover:text-primary-foreground transition-colors">{t("Privacy Policy")}</Link></li>
              <li><a href="mailto:hello@jointidy.co" className="hover:text-primary-foreground transition-colors">{t("Contact Us")}</a></li>
              <li>
                <Link
                  to="/apply"
                  className="group inline-flex items-center gap-1.5 text-gold/90 hover:text-gold font-semibold transition"
                >
                  Careers — Apply to work with us
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom rule */}
        <div className="mt-14 pt-6 border-t border-white/[0.08]">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-primary-foreground/40">
            <p>© 2026 Tidy Home Concierge LLC · Miami, Florida</p>
            <div className="flex gap-5">
              <Link to="/terms" className="hover:text-primary-foreground/70 transition-colors">{t("Terms")}</Link>
              <Link to="/privacy" className="hover:text-primary-foreground/70 transition-colors">{t("Privacy")}</Link>
              <a href="#faq" className="hover:text-primary-foreground/70 transition-colors">{t("FAQ")}</a>
            </div>
          </div>
          <p className="text-[10px] text-primary-foreground/25 mt-5 text-center leading-relaxed max-w-3xl mx-auto">
            Serving 33183 Kendall · 33186 Kendall West · 33156 Pinecrest with recurring house cleaning,
            lawn care, and car detailing subscriptions.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
