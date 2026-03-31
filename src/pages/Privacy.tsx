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
        <section className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-lg font-bold text-foreground">SMS Communications & Data Privacy</h2>
          <p>By providing your phone number and checking the SMS consent box, you consent to receive recurring automated SMS messages from Tidy Home Concierge LLC, including service updates, appointment reminders, and promotional offers. Message frequency varies. Message and data rates may apply. Reply STOP to cancel or HELP for assistance. Contact <a href="mailto:hello@jointidy.co" className="text-primary underline">hello@jointidy.co</a> for support.</p>
          <p className="mt-3 font-bold">Text messaging opt-in data and consent will not be shared with any third parties or affiliates for marketing or promotional purposes. All other data-sharing categories explicitly exclude SMS/text messaging opt-in information and consent data — this information will not be sold, rented, or disclosed to any third party under any circumstances.</p>
          <p className="mt-2">Mobile information, including phone numbers collected for SMS communications, will not be shared with third parties or affiliates for marketing or promotional purposes. Consent to receive SMS is not a condition of purchase. Carriers are not liable for delayed or undelivered messages.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">Information Sharing</h2>
          <p>We do not sell your personal information. We share only with trusted third parties necessary to operate our services: Stripe (payments), Twilio (SMS delivery only), and analytics tools. These parties do not receive your SMS opt-in consent data or use your information for their own marketing purposes.</p>
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
