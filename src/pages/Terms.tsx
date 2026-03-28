import TidyLogo from "@/components/TidyLogo";
import { Link } from "react-router-dom";

const Terms = () => (
  <div className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/"><TidyLogo size="sm" /></Link>
        <h1 className="text-2xl font-bold text-foreground">Terms of Service</h1>
      </div>
      <p className="text-sm text-text-light mb-8">Effective Date: March 25, 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-foreground/80">
        <section>
          <h2 className="text-lg font-bold text-foreground">1. Service Type</h2>
          <p>Tidy provides recurring maintenance services including house cleaning, lawn care, and car detailing. Tidy does NOT provide restoration, hazardous cleanup, or extreme-condition services unless purchased separately.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">2. Service Scope Limitations</h2>
          <p>Standard services include routine maintenance only. Not included: extreme buildup or neglect, hazardous materials, mold remediation, biohazard cleanup, heavy stain restoration, paint correction, construction debris cleanup.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">3. Access Requirements</h2>
          <p>Customer must provide safe and unobstructed access. Service may be skipped or rescheduled if contractors cannot safely access the property.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">4. Weather Conditions</h2>
          <p>Outdoor services may be rescheduled due to unsafe weather. Subscription remains active.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">5. Subscription Billing</h2>
          <p>All services are billed on a recurring monthly basis via Stripe. By signing up, you authorize Tidy to charge your payment method automatically on a recurring basis.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">6. Failed Payments</h2>
          <p>If payment fails, service may be paused until resolved. You will be notified immediately.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">7. Cancellation</h2>
          <p>Cancel anytime. No refunds for completed services.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">8. Satisfaction</h2>
          <p>Notify us within 24 hours of any service issue. We will make reasonable efforts to resolve it.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">9. SMS Consent</h2>
          <p>By providing your phone number, you consent to receive SMS messages from Tidy. Message and data rates may apply. Reply STOP to opt out. Contact hello@jointidy.co for help.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">10. Limitation of Liability</h2>
          <p>Tidy's liability is limited to the amount paid for the specific service in question.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">11. Governing Law</h2>
          <p>These Terms are governed by the laws of the State of Florida.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-foreground">12. Contact</h2>
          <p><a href="mailto:hello@jointidy.co" className="text-primary underline">hello@jointidy.co</a></p>
        </section>
      </div>

      <div className="mt-12">
        <Link to="/" className="text-sm text-primary hover:text-primary-deep font-medium transition-colors">← Back to the site</Link>
      </div>
    </div>
  </div>
);

export default Terms;
