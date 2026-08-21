import TidyLogo from "@/components/TidyLogo";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const Terms = () => {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/">
            <TidyLogo size="sm" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{t("Terms of Service")}</h1>
        </div>
        <p className="text-sm text-text-light mb-8">{t("Effective Date: March 25, 2026")}</p>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground/80">
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("1. Service Type")}</h2>
            <p>
              {t(
                "Tidy provides recurring maintenance services including house cleaning, lawn care, and car detailing. Tidy does NOT provide restoration, hazardous cleanup, or extreme-condition services unless purchased separately. Services are performed by independent contractors engaged by Tidy. Tidy carries commercial general liability coverage on every Tidy assignment, and contractors are background-checked.",
              )}
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("2. Service Scope Limitations")}</h2>
            <p>
              {t(
                "Standard services include routine maintenance only. Not included: extreme buildup or neglect, hazardous materials, mold remediation, biohazard cleanup, heavy stain restoration, paint correction, construction debris cleanup.",
              )}
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("3. Access Requirements")}</h2>
            <p>
              {t(
                "Customer must provide safe and unobstructed access. Service may be skipped or rescheduled if contractors cannot safely access the property.",
              )}
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("4. Weather Conditions")}</h2>
            <p>{t("Outdoor services may be rescheduled due to unsafe weather. Subscription remains active.")}</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("5. Subscription Billing")}</h2>
            <p>
              {t(
                "All services are billed on a recurring monthly basis via Stripe. By signing up, you authorize Tidy to charge your payment method automatically on a recurring basis.",
              )}
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("6. Failed Payments")}</h2>
            <p>{t("If payment fails, service may be paused until resolved. You will be notified immediately.")}</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("7. Cancellation")}</h2>
            <p>
              {t(
                "You can cancel at any time from the Billing page in your account. Cancellation takes effect at the end of the billing period you have already paid for, so you keep the visits in that period and no further charge is made. We do not prorate or refund the period already paid. You can undo a cancellation any time before it takes effect. You can also pause your plan for up to 60 days from the Billing page, during which no charges are made and we hold your slot. You can skip an individual visit from your dashboard, which does not change your billing for that period.",
              )}
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("8. Satisfaction")}</h2>
            <p>{t("Notify us within 24 hours of any service issue. We will make reasonable efforts to resolve it.")}</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("9. SMS Communications")}</h2>
            <div className="space-y-2">
              <p>
                {t(
                  "By checking the SMS consent box and providing your phone number, you expressly consent to receive recurring automated promotional and informational text messages from Tidy Home Concierge LLC, including service updates, appointment reminders, and exclusive offers, at the phone number provided. Message frequency varies.",
                )}
              </p>
              <p>
                {t(
                  "Msg & data rates may apply. Consent to receive SMS messages is not a condition of any purchase. You may opt out at any time by replying STOP to any message. Reply HELP for assistance or contact",
                )}{" "}
                <a href="mailto:hello@jointidy.co" className="text-primary underline">
                  {t("hello@jointidy.co")}
                </a>
                .
              </p>
              <p>{t("Carriers are not liable for delayed or undelivered messages.")}</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
                <p className="font-semibold text-foreground">{t("SMS Data Privacy")}</p>
                <p>
                  {t(
                    "Text messaging opt-in data and consent will not be shared with any third parties or affiliates for marketing or promotional purposes. All other data-sharing categories specifically exclude text messaging opt-in data and consent.",
                  )}
                </p>
              </div>
            </div>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("10. Limitation of Liability")}</h2>
            <p>{t("Tidy's liability is limited to the amount paid for the specific service in question.")}</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("11. Governing Law")}</h2>
            <p>{t("These Terms are governed by the laws of the State of Florida.")}</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("12. Contact")}</h2>
            <p>
              <a href="mailto:hello@jointidy.co" className="text-primary underline">
                {t("hello@jointidy.co")}
              </a>
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("13. Pricing and Founding Rate")}</h2>
            <p>
              {t(
                "The price shown at signup is the price charged. Founding members — the first 25 homes per ZIP code — keep their signup rate for as long as their membership remains active and are not subject to later price increases. A founding rate is tied to continuous membership and does not carry over if the plan is cancelled and later restarted.",
              )}
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground">{t("14. Referral Program")}</h2>
            <p>
              {t(
                "A customer who refers a new customer receives $50 in account credit, and the new customer receives $50 off their first month. The credit is applied after the referred customer's first invoice clears. The referred customer must be new to Tidy. Credit has no cash value.",
              )}
            </p>
          </section>
        </div>

        <div className="mt-12">
          <Link to="/" className="text-sm text-primary hover:text-primary-deep font-medium transition-colors">
            {t("← Back to the site")}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Terms;
