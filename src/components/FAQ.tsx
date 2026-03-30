import { useState } from "react";
import { ChevronDown } from "lucide-react";
import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";

const faqSections = [
  {
    title: "Getting Started",
    items: [
      { q: "What is Tidy?", a: "Great question! Tidy is Miami's first all-in-one home services subscription — we handle your house cleaning, lawn care, and car detailing all under one simple monthly plan. No juggling multiple providers, no chasing quotes. Just one subscription and everything stays spotless." },
      { q: "How do I sign up?", a: "Super easy — just tap the 'Get Early Access' button, fill out a quick 60-second form with your name and contact info, and we'll reach out to confirm your spot and lock in your schedule. That's it!" },
      { q: "Where is Tidy available?", a: "We're currently serving some of Miami's best neighborhoods: Kendall (33183, 33186), Pinecrest (33156), South Kendall (33173), Sunset (33176), Coral Gables (33146), South Miami (33143), and Doral (33178). More areas are coming soon — grab your spot now!" },
      { q: "Is there a commitment?", a: "Nope — zero commitment! There are no contracts and no cancellation fees. You can cancel anytime, no questions asked. We earn your business every single month." },
    ],
  },
  {
    title: "Services & Scheduling",
    items: [
      { q: "How often do services happen?", a: "Totally up to you! Choose weekly, biweekly, or monthly for each service — and yes, you can mix and match. Want weekly lawn care but biweekly cleaning? Done. We build your plan around your life." },
      { q: "Do I need to be home?", a: "Not at all! Just give us access via a lockbox, gate code, or smart lock and our team handles everything while you're out living your best life. You'll get photo confirmation when each service is done." },
      { q: "Can I reschedule or pause?", a: "Absolutely! Life happens — just shoot us a message and we'll move things around for you. Need to pause for a vacation? No problem. We've got you covered." },
      { q: "What if it rains?", a: "No worries! If weather impacts an outdoor service, we'll automatically reschedule it for the next available day. Your subscription stays active and you won't miss a beat." },
    ],
  },
  {
    title: "Service Scope",
    items: [
      { q: "What does house cleaning include?", a: "We cover all the essentials to keep your home feeling fresh — kitchen surfaces and countertops, full bathroom cleaning, dusting throughout, vacuuming and mopping all floors, and trash removal. Your home will look and feel amazing after every visit." },
      { q: "What does lawn care include?", a: "We keep your curb appeal on point! Every visit includes professional mowing, clean edging along walkways and beds, and blowing all debris off your walkways and driveways. Your neighbors will notice the difference." },
      { q: "What does car detailing include?", a: "Your ride deserves love too! We do a full exterior hand wash with wheel cleaning, thorough interior vacuum, and a complete interior surface wipe-down. Your car will look showroom-ready right in your driveway." },
      { q: "Are deep cleaning or restoration services included?", a: "Tidy is designed for consistent, ongoing maintenance — the kind that keeps everything looking great week after week. If you need a one-time deep clean or restoration work, we offer those as add-ons. Just ask!" },
    ],
  },
  {
    title: "Billing",
    items: [
      { q: "How does billing work?", a: "Simple and transparent! You're billed monthly via Stripe — everything is automatic, fully secure, and you'll get a receipt every time. No surprise charges, ever." },
      { q: "Can I cancel anytime?", a: "Yes, 100%! No cancellation fees, no contracts, no awkward phone calls. If you ever want to cancel, just let us know and we'll take care of it immediately." },
      { q: "What if my payment fails?", a: "We'll pause your services and notify you right away via SMS and email so you can update your payment info. Once it's sorted, we'll get you back on schedule — easy as that." },
      { q: "Can I change services later?", a: "Of course! Want to add car detailing or switch your cleaning frequency? Just reach out and any changes will kick in at your next billing cycle. We're flexible because your needs are too." },
    ],
  },
  {
    title: "Trust & Quality",
    items: [
      { q: "Are contractors vetted?", a: "Absolutely — your trust means everything to us. Every single contractor is fully background-checked, and we require photo documentation after every visit so you can see exactly what was done. Quality and accountability are built into everything we do." },
      { q: "What if I'm not satisfied?", a: "We want you to love every service! If something isn't right, just reach out within 24 hours and we'll make it right — whether that means a re-service or a credit. Your satisfaction is our top priority." },
      { q: "How do I contact support?", a: "We're here for you! Email us at hello@jointidy.co and we'll get back to you within 1 hour during business hours. Real people, real answers, real fast." },
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
