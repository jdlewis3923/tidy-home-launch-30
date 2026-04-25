import ServiceLandingPage, { ServiceLandingConfig } from "@/components/landing/ServiceLandingPage";
import heroImg from "@/assets/lp-lawn-care.jpg";
import heroImgMobile from "@/assets/lp-lawn-care-mobile.png";

const config: ServiceLandingConfig = {
  serviceSlug: "lawn-care",
  signupServiceParam: "lawn",
  eyebrow: "Lawn Care",
  h1: "Monthly Lawn Care in Pinecrest + Kendall",
  subhead:
    "Mow, edge, blow. Same crew. Locked price. Never surprise-billed.",
  priceAnchor: "Starting at $85/mo",
  stickyLabel: "Lawn Care · from $85/mo",
  savingsCallout:
    "Most Pinecrest lawn pros charge **$40–$60 per visit**. Monthly Tidy is **$85/mo flat**, same crew, no surprise invoices.",
  heroImage: heroImg,
  heroImageMobile: heroImgMobile,
  heroAlt: "Freshly mowed striped emerald lawn at a Pinecrest home",
  plans: [
    {
      name: "Monthly",
      price: "$85",
      cadence: "/mo",
      planSlug: "monthly",
      description: "One visit per month.",
    },
    {
      name: "Biweekly",
      price: "$149",
      cadence: "/mo",
      planSlug: "biweekly",
      description: "Two visits per month.",
      highlighted: true,
    },
    {
      name: "Weekly",
      price: "$239",
      cadence: "/mo",
      planSlug: "weekly",
      description: "Four visits per month, bush trim included.",
    },
  ],
  included: [
    "Mow to precise height",
    "Edge all borders",
    "Blow hardscapes clean",
    "Weed-whack fence lines",
    "Bag or mulch clippings",
    "Bush trim (weekly)",
    "Seasonal fertilization available",
    "Same crew every visit",
    "Fully insured",
    "Locked $85 — never surprise-priced",
  ],
  testimonials: [
    {
      quote:
        "Lawn looks sharp every week without me lifting a finger. Best $85 I spend monthly.",
      name: "Placeholder Customer",
      zip: "33156",
    },
    {
      quote:
        "Edges are crisp, beds are clean, no debris left behind. Pure consistency.",
      name: "Placeholder Customer",
      zip: "33183",
    },
    {
      quote:
        "They show up rain or shine. Locked price, never a surprise invoice.",
      name: "Placeholder Customer",
      zip: "33186",
    },
  ],
  faqs: [
    {
      q: "What's the price and what's it based on?",
      a: "Plans start at $85/mo monthly, $149/mo biweekly, $239/mo weekly. Pricing is based on cadence and yard size. Standard pricing covers most yards up to 4,000 sq ft of mowable turf.",
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
      a: "Mowing to precise height, edging all borders, blowing all hardscapes, weed-whacking fence lines, and bagging or mulching clippings. Weekly plans include bush trim.",
    },
    {
      q: "Who does the work?",
      a: "Licensed, insured, background-checked crews. Same team every visit so your lawn stays consistent.",
    },
    {
      q: "What if it rains?",
      a: "We automatically reschedule to the next available day. Your subscription stays active and your price doesn't change.",
    },
    {
      q: "What if I'm not satisfied?",
      a: "Reach out within 24 hours and we'll send the crew back or credit your account — no questions asked.",
    },
  ],
  bundleCta: {
    title: "Already booking lawn? Add biweekly cleaning for $279/mo.",
    body: "Save 10% when you stack — and never coordinate two providers again.",
    targetServices: "lawn,cleaning",
  },
  seo: {
    title: "Lawn Care in Pinecrest + Kendall | Tidy Home Services",
    description:
      "Weekly lawn care in Pinecrest and Kendall (33156, 33183, 33186). Mow, edge, blow. Locked price from $85/mo. Same crew, no contracts. Book in 60 seconds.",
    canonical: "https://jointidy.co/lawn-care",
    priceRange: "$85–$239",
  },
};

const LawnCarePage = () => <ServiceLandingPage config={config} />;
export default LawnCarePage;
