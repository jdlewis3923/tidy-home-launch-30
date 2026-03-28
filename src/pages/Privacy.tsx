import TidyLogo from "@/components/TidyLogo";
import { Link } from "react-router-dom";

const Privacy = () => (
  <div className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/"><TidyLogo size="sm" /></Link>
        <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
      </div>
      <p className="text-sm text-text-light mb-8">Effective Date: March 25, 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-foreground/80">
        <section>
          <h2 className="text-lg font-bold text-foreground">Information We Collect</h2>
          <p>Name, email, phone, service address, ZIP code, and payment information. Payment is processed securely by Stripe — we never store card details. Usage data: IP address, browser type, pages visited.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">How We Use It</h2>
          <p>To provide and manage services, schedule appointments, process payments, communicate with you, and improve our offerings.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">SMS Communications</h2>
          <p>By providing your phone number, you consent to receive SMS messages from Tidy including service updates, reminders, and promotional messages. Message frequency varies. Message and data rates may apply. Reply STOP to opt out anytime. Reply HELP or contact hello@jointidy.co for assistance.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">Information Sharing</h2>
          <p>We do not sell your personal information. We share only with trusted third parties: Stripe (payments), Twilio (SMS), Simvoly (website), Jobber (scheduling), and analytics tools.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">Security</h2>
          <p>Industry-standard security measures. No transmission method is 100% secure.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">Cookies & Tracking</h2>
          <p>We use Google Analytics and Meta Pixel. You may disable cookies through your browser settings.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">Your Rights</h2>
          <p>Request access, correction, or deletion: <a href="mailto:hello@jointidy.co" className="text-primary underline">hello@jointidy.co</a></p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">Minors</h2>
          <p>Our services are not intended for individuals under 18.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">Contact</h2>
          <p><a href="mailto:hello@jointidy.co" className="text-primary underline">hello@jointidy.co</a></p>
        </section>
      </div>

      <div className="mt-12">
        <Link to="/" className="text-sm text-primary hover:text-primary-deep font-medium transition-colors">← Back to the site</Link>
      </div>
    </div>
  </div>
);

export default Privacy;
