import ServiceLandingPage, { ServiceLandingConfig } from "@/components/landing/ServiceLandingPage";
import heroImg from "@/assets/lp-house-cleaning.jpg";

const config: ServiceLandingConfig = {
  serviceSlug: "house-cleaning",
  signupServiceParam: "cleaning",
  eyebrow: "House Cleaning",
  h1: "Monthly House Cleaning in Pinecrest + Kendall",
  subhead:
    "Same crew. Locked rate. No contracts. Handle your home on autopilot.",
  priceAnchor: "Starting at $159/mo",
  stickyLabel: "House Cleaning · from $159/mo",
  savingsCallout:
    "One-off cleanings in Pinecrest average **$180–$260**. Our monthly plan locks you in at **$159** — with the same crew every visit.",
  heroImage: heroImg,
  heroAlt: "Bright, freshly cleaned modern Miami living room",
  plans: [
    {
      name: "Monthly",
      price: "$159",
      cadence: "/mo",
      planSlug: "monthly",
      description: "One visit per month, same crew every time.",
    },
    {
      name: "Biweekly",
      price: "$279",
      cadence: "/mo",
      planSlug: "biweekly",
      description: "Two visits per month, priority scheduling.",
      highlighted: true,
    },
    {
      name: "Weekly",
      price: "$459",
      cadence: "/mo",
      planSlug: "weekly",
      description: "Weekly visits, dedicated crew, quarterly deep-clean.",
    },
  ],
  included: [
    "Dust all surfaces",
    "Vacuum + mop all floors",
    "Kitchen deep-clean",
    "Bathroom disinfect",
    "Bedroom tidy + linen change",
    "Interior windows",
    "Trash out",
    "Eco-safe products",
    "Same crew every visit",
    "Fully insured",
  ],
  testimonials: [
    {
      quote:
        "Kitchen and bathrooms look reset every time. Same crew, same standard — feels effortless.",
      name: "Placeholder Customer",
      zip: "33156",
    },
    {
      quote:
        "I haven't touched a mop in months. Locked monthly price, no surprise bills.",
      name: "Placeholder Customer",
      zip: "33183",
    },
    {
      quote:
        "Booked in under a minute. The crew is on time, polite, and thorough.",
      name: "Placeholder Customer",
      zip: "33186",
    },
  ],
  faqs: [
    {
      q: "What's the price and what's it based on?",
      a: "Plans start at $159/mo for a monthly visit, $279/mo biweekly, $459/mo weekly. Pricing is based on cadence and home size. Standard pricing covers most homes up to 2,500 sq ft — larger homes have a small flat upgrade.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. No contracts, no cancellation fees. Pause, skip, or cancel from your dashboard anytime.",
    },
    {
      q: "What's your service area?",
      a: "We serve Pinecrest and Kendall — ZIP codes 33156, 33183, and 33186. We're not currently serving other areas.",
    },
    {
      q: "What's actually included in a visit?",
      a: "Kitchen deep-clean, bathroom disinfect, dusting all surfaces, vacuum and mop all floors, interior windows, bedroom tidy, linen change, and trash out — using eco-safe products.",
    },
    {
      q: "Who does the cleaning?",
      a: "Licensed, insured, background-checked professionals. Same crew every visit so they learn your home.",
    },
    {
      q: "How is scheduling handled?",
      a: "After signup, we lock in a recurring day and time window. You'll get an ETA reminder before every visit. Reschedule anytime from your dashboard.",
    },
    {
      q: "What if I'm not satisfied?",
      a: "Reach out within 24 hours and we'll re-clean the area or credit your account — no questions asked.",
    },
  ],
  bundleCta: {
    title: "Already booking cleaning? Add lawn care for $85/mo.",
    body: "Save 10% when you stack — and never coordinate two providers again.",
    targetServices: "cleaning,lawn",
  },
  seo: {
    title: "House Cleaning in Pinecrest + Kendall | Tidy Home Services",
    description:
      "Monthly house cleaning in Pinecrest and Kendall (33156, 33183, 33186). Locked price from $159/mo. Same crew, no contracts, eco-safe. Book in 60 seconds.",
    canonical: "https://jointidy.co/house-cleaning",
    priceRange: "$159–$459",
  },
};

const HouseCleaningPage = () => <ServiceLandingPage config={config} />;
export default HouseCleaningPage;
