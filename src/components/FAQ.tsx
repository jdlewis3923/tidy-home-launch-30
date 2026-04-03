import { useState } from "react";
import { ChevronDown } from "lucide-react";
import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";

const faqSections = [
  {
    title: "Getting Started",
    items: [
      { q: "What is Tidy?", a: "Tidy is Miami's first all-in-one home services subscription — we handle your house cleaning, lawn care, and car detailing all under one simple monthly plan. No juggling multiple providers, no chasing quotes. Just one subscription and everything stays spotless." },
      { q: "How do I sign up?", a: "Tap 'Start My Plan,' choose your services and schedule, and complete checkout. Your first visit is confirmed within 24 hours." },
      { q: "Where is Tidy available?", a: "We currently serve Kendall (33183, 33186), Pinecrest (33156), South Kendall (33173), Sunset (33176), Coral Gables (33146), South Miami (33143), and Doral (33178). More areas coming soon." },
      { q: "Is there a commitment?", a: "No contracts, no cancellation fees. You can cancel anytime, no questions asked. We earn your business every single month." },
    ],
  },
  {
    title: "Services & Scheduling",
    items: [
      { q: "How often do services happen?", a: "Choose weekly, biweekly, or monthly for each service — and mix and match freely. Want weekly lawn care but biweekly cleaning? Done." },
      { q: "Do I need to be home?", a: "Not at all. Provide access via a lockbox, gate code, or smart lock and our team handles everything. You'll get photo confirmation when each service is complete." },
      { q: "Can I reschedule or pause?", a: "Yes — reschedule, pause for vacation, or skip a visit anytime through your dashboard or by contacting us. No penalties." },
      { q: "What if it rains?", a: "If weather impacts an outdoor service, we automatically reschedule for the next available day. Your subscription stays active." },
      { q: "How does scheduling actually work?", a: "After signup, Tidy assigns a recurring day and time window for each service. You'll receive a confirmation and an ETA reminder before every visit. No rebooking needed — it just repeats automatically." },
    ],
  },
  {
    title: "Service Scope",
    items: [
      { q: "What does house cleaning include?", a: "Kitchen surfaces, full bathroom cleaning, dusting throughout, vacuuming and mopping all floors, and trash removal with fresh liners." },
      { q: "What does lawn care include?", a: "Professional mowing to standard height, clean edging along walkways and beds, and debris blowing off walkways and driveways." },
      { q: "What does car detailing include?", a: "Full exterior hand wash with wheel cleaning, interior vacuum with floor mats, and dashboard and surface wipe-down — right in your driveway." },
      { q: "Can I add extra services or upgrades?", a: "Yes. Add-ons like deep cleaning, hedge trimming, leather conditioning, and more are available as one-time or recurring extras. You can add them anytime through your dashboard." },
      { q: "Are deep cleaning or restoration services included?", a: "Tidy is designed for consistent ongoing maintenance. Deep cleans and restoration work are available as add-ons — just ask." },
    ],
  },
  {
    title: "Billing & Account",
    items: [
      { q: "How does billing work?", a: "You're billed monthly via Stripe — automatic, fully secure, with a receipt every time. No surprise charges." },
      { q: "When am I charged?", a: "Your first charge happens at signup. After that, billing recurs on the same date each month. You can view your billing history in your dashboard." },
      { q: "Can I cancel anytime?", a: "Yes, 100%. No cancellation fees, no contracts. Let us know and we'll take care of it immediately." },
      { q: "What if my payment fails?", a: "We'll pause your services and notify you via SMS and email so you can update your payment info. Once resolved, you're back on schedule." },
      { q: "Can I change services later?", a: "Of course. Add, remove, or change frequency for any service anytime. Changes kick in at your next billing cycle." },
    ],
  },
  {
    title: "Trust & Quality",
    items: [
      { q: "Are professionals vetted?", a: "Every professional is fully background-checked, licensed, and insured. We require photo documentation after every visit for accountability." },
      { q: "What if I'm not satisfied?", a: "Reach out within 24 hours and we'll make it right — re-service or credit, no questions asked. Your satisfaction is our top priority." },
      { q: "What if something goes wrong during a visit?", a: "Every professional carries liability insurance. If there's ever an issue, contact us immediately and we'll resolve it — including damage claims if applicable." },
      { q: "How do I contact support?", a: "Email hello@jointidy.co and we'll respond within 1 hour during business hours. Real people, real answers." },
    ],
  },
  {
    title: "Your Dashboard",
    items: [
      { q: "What can I do from the dashboard?", a: "View upcoming visits, manage your services and schedule, update payment info, skip or pause visits, and review service history — all in one place." },
      { q: "Can I manage everything without calling?", a: "Yes. The dashboard gives you full control over your plan. No phone calls, no emails required for routine changes." },
    ],
  },
];

const FAQ = () => {
  const [openItem, setOpenItem] = useState<string | null>(null);
  const { t } = useLanguage();

  return (
    <section id="faq" className="bg-section-alt py-20 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <FadeIn>
          <span className="text-xs uppercase tracking-widest text-primary font-semibold">{t("FAQ")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{t("Common questions")}</h2>
          <p className="text-text-mid mt-3 mb-12">{t("Most customers never need to think about any of this — but we've got you covered.")}</p>
        </FadeIn>

        <div className="space-y-8 text-left">
          {faqSections.map((section, si) => (
            <FadeIn key={section.title} delay={si * 100} direction="up">
              <div>
                <h3 className="text-sm font-bold text-primary uppercase tracking-wide mb-4">{t(section.title)}</h3>
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const key = `${section.title}-${item.q}`;
                    const isOpen = openItem === key;
                    return (
                      <div key={key} className="bg-card border rounded-lg overflow-hidden transition-shadow duration-300 hover:shadow-md">
                        <button
                          onClick={() => setOpenItem(isOpen ? null : key)}
                          className="w-full flex items-center justify-between px-5 py-4 text-left"
                        >
                          <span className="text-sm font-medium text-foreground">{t(item.q)}</span>
                          <ChevronDown className={`w-4 h-4 text-text-light transition-transform duration-300 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                        <div
                          className="overflow-hidden transition-all duration-300 ease-out"
                          style={{
                            maxHeight: isOpen ? "200px" : "0px",
                            opacity: isOpen ? 1 : 0,
                          }}
                        >
                          <div className="px-5 pb-4">
                            <p className="text-sm text-text-mid">{t(item.a)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
