import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqSections = [
  {
    title: "Getting Started",
    items: [
      { q: "What is Tidy?", a: "Miami's first all-in-one home services subscription. House cleaning, lawn care, and car detailing under one monthly plan." },
      { q: "How do I sign up?", a: "Request early access above, fill the quick form (60 seconds), and we confirm your spot and schedule." },
      { q: "Where is Tidy available?", a: "Kendall (33183, 33186), Pinecrest (33156), South Kendall (33173), Sunset (33176), Coral Gables (33146), South Miami (33143), Doral (33178)." },
      { q: "Is there a commitment?", a: "No. Cancel anytime. No contracts, no cancellation fees." },
    ],
  },
  {
    title: "Services & Scheduling",
    items: [
      { q: "How often do services happen?", a: "Weekly, biweekly, or monthly based on your selection. Different services can have different frequencies." },
      { q: "Do I need to be home?", a: "No. Provide access via lockbox or gate code and service is completed while you're away." },
      { q: "Can I reschedule or pause?", a: "Yes. Contact us and we'll adjust." },
      { q: "What if it rains?", a: "Outdoor services are rescheduled. Your subscription stays active." },
    ],
  },
  {
    title: "Service Scope",
    items: [
      { q: "What does house cleaning include?", a: "Kitchen surfaces, bathroom cleaning, dusting, vacuuming and mopping floors, trash removal." },
      { q: "What does lawn care include?", a: "Mowing, edging, and blowing debris from walkways and driveways." },
      { q: "What does car detailing include?", a: "Exterior hand wash and wheel cleaning, interior vacuum, interior surface wipe-down." },
      { q: "Are deep cleaning or restoration services included?", a: "No. Tidy is designed for ongoing maintenance. Deep services are available as add-ons." },
    ],
  },
  {
    title: "Billing",
    items: [
      { q: "How does billing work?", a: "Monthly recurring via Stripe. Automatic, secure, receipted." },
      { q: "Can I cancel anytime?", a: "Yes. No fees. No contracts." },
      { q: "What if my payment fails?", a: "Service pauses and you're notified immediately via SMS and email." },
      { q: "Can I change services later?", a: "Yes. Changes take effect next billing cycle." },
    ],
  },
  {
    title: "Trust & Quality",
    items: [
      { q: "Are contractors vetted?", a: "All are background-checked. Photo documentation required after every visit." },
      { q: "What if I'm not satisfied?", a: "Contact us within 24 hours and we'll make it right." },
      { q: "How do I contact support?", a: "hello@jointidy.co — we respond within 1 hour during business hours." },
    ],
  },
];

const FAQ = () => {
  const [openItem, setOpenItem] = useState<string | null>(null);

  return (
    <section id="faq" className="bg-section-alt py-20 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">FAQ</span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-12">Common questions</h2>

        <div className="space-y-8 text-left">
          {faqSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-bold text-primary uppercase tracking-wide mb-4">{section.title}</h3>
              <div className="space-y-2">
                {section.items.map((item) => {
                  const key = `${section.title}-${item.q}`;
                  const isOpen = openItem === key;
                  return (
                    <div key={key} className="bg-card border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setOpenItem(isOpen ? null : key)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left"
                      >
                        <span className="text-sm font-medium text-foreground">{item.q}</span>
                        <ChevronDown className={`w-4 h-4 text-text-light transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4">
                          <p className="text-sm text-text-mid">{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
