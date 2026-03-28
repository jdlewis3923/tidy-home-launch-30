import TidyLogo from "./TidyLogo";
import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="bg-navy-deep py-16 px-4">
    <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-12">
      <div>
        <TidyLogo size="md" />
        <p className="text-primary-foreground/50 text-sm mt-4 leading-relaxed">
          Miami's subscription home service. House cleaning, lawn care, and car detailing — one simple monthly plan. Serving Kendall, Pinecrest & beyond.
        </p>
        <p className="text-primary-foreground/40 text-sm mt-4">
          <a href="mailto:hello@jointidy.co" className="hover:text-primary transition-colors">hello@jointidy.co</a>
          <br />
          <a href="https://jointidy.co" className="hover:text-primary transition-colors">jointidy.co</a>
          <br />Miami, Florida
        </p>
        <div className="flex gap-4 mt-4">
          {["Instagram", "Facebook", "TikTok", "LinkedIn"].map((s) => (
            <span key={s} className="text-xs text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors cursor-pointer">{s}</span>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-primary-foreground mb-4">Services</h4>
        <ul className="space-y-2 text-sm text-primary-foreground/40">
          <li>House Cleaning Miami</li>
          <li>Lawn Care Miami</li>
          <li>Car Detailing Miami</li>
          <li><a href="#pricing" className="hover:text-primary-foreground/70 transition-colors">Pricing</a></li>
          <li>Referral Program</li>
        </ul>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-primary-foreground mb-4">Company</h4>
        <ul className="space-y-2 text-sm text-primary-foreground/40">
          <li><a href="#how-it-works" className="hover:text-primary-foreground/70 transition-colors">How It Works</a></li>
          <li><a href="#faq" className="hover:text-primary-foreground/70 transition-colors">FAQ</a></li>
          <li>Service Areas</li>
          <li><Link to="/terms" className="hover:text-primary-foreground/70 transition-colors">Terms of Service</Link></li>
          <li><Link to="/privacy" className="hover:text-primary-foreground/70 transition-colors">Privacy Policy</Link></li>
          <li><a href="mailto:hello@jointidy.co" className="hover:text-primary-foreground/70 transition-colors">Contact Us</a></li>
        </ul>
      </div>
    </div>

    <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-primary-foreground/10">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-primary-foreground/30">
        <p>© 2026 Tidy Home Concierge LLC. All rights reserved. Miami, Florida. hello@jointidy.co</p>
        <div className="flex gap-4">
          <Link to="/terms" className="hover:text-primary-foreground/50 transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-primary-foreground/50 transition-colors">Privacy</Link>
          <a href="#faq" className="hover:text-primary-foreground/50 transition-colors">FAQ</a>
        </div>
      </div>
      <p className="text-[10px] text-primary-foreground/20 mt-4 text-center">
        Serving Kendall, Pinecrest, Coral Gables, South Miami, Doral & surrounding Miami neighborhoods with recurring house cleaning, lawn care, and car detailing subscriptions.
      </p>
    </div>
  </footer>
);

export default Footer;
