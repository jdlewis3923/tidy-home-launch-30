import ServiceLandingPage, { ServiceLandingConfig } from "@/components/landing/ServiceLandingPage";
import heroImg from "@/assets/lp-lawn-care.jpg";
import heroImgMobile from "@/assets/lp-lawn-care-mobile.jpg";

const config: ServiceLandingConfig = {
  serviceSlug: "lawn-care",
  signupServiceParam: "lawn",
  eyebrow: "Lawn Care",
  h1: "Monthly Lawn Care in Pinecrest + Kendall",
  subhead:
    "Reliable lawn care, done right every time. Mow, edge, blow.",
  intentConfirm:
    "Same crew every visit. Locked monthly price. Cancel anytime.",
  systemBridge:
    "Tidy isn't just lawn — it's a system for your entire home.",
  ctaPrimaryLabel: "Start lawn care",
  ctaPlanLabel: "Start your plan",
  priceAnchor: "From $45 a visit",
  stickyLabel: "Lawn Care · from $45 a visit",
  savingsCallout:
    "Most Pinecrest lawn pros charge **$40–$60 per visit** and re-quote you later. Tidy is **$45 a visit** flat, same crew, no surprise invoices.",
  heroImage: heroImg,
  heroImageMobile: heroImgMobile,
  heroAlt: "Freshly mowed striped emerald lawn at a Pinecrest home",
  plans: [
    {
      name: "Monthly",
      price: "$45",
      cadence: "/mo",
      planSlug: "monthly",
      description: "One visit per month.",
    },
    {
      name: "Biweekly",
      price: "$90",
      cadence: "/mo",
      planSlug: "biweekly",
      description: "Two visits per month.",
      highlighted: true,
    },
    {
      name: "Weekly",
      price: "$180",
      cadence: "/mo",
      planSlug: "weekly",
      description: "Four visits per month.",
    },
  ],
  included: [
    "Mow to precise height",
    "Edge all borders",
    "Blow hardscapes clean",
    "Weed-whack fence lines",
    "Bag or mulch clippings",
    "Same crew every visit",
    "Background-checked pros",
    "Locked $45 a visit — never surprise-priced",
  ],
  addOnsNote: "Available as add-ons: weed removal, leaf & debris cleanup, bed edge reset, exterior windows & screens. Driveway pressure wash is specialist work, quoted separately.",
  trustCards: [
    {
      title: "Same Crew",
      body: "Your same pro every visit, not a rotating marketplace crew.",
    },
    {
      title: "Photo-Verified",
      body: "Before-and-after photos from every visit, sent to your phone.",
    },
    {
      title: "Background-Checked",
      body: "Every pro is background-checked through Checkr before their first visit.",
    },
  ],

  faqs: [
    {
      q: "What's the price and what's it based on?",
      a: "One flat price per visit, set by the size of your lawn: $45, $65 or $99. How often we come just multiplies it — monthly is one visit, biweekly two, weekly four. Pick your best guess and we confirm the size from satellite imagery before your first visit.",
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
      a: "Mowing to precise height, edging all borders, blowing all hardscapes, weed-whacking fence lines, and bagging or mulching clippings. A bed edge reset is available as an add-on.",
    },
    {
      q: "Who does the work?",
      a: "Vetted, background-checked crews. Same team every visit so your lawn stays consistent.",
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
    title: "Already booking lawn? Add cleaning from $139 a visit.",
    body: "Add a 2nd service and you pick one free premium add-on every month — and you never coordinate two providers again.",
    targetServices: "lawn,cleaning",
  },
  seo: {
    title: "Lawn Care in Pinecrest + Kendall | Tidy Home Concierge",
    description:
      "Lawn care in Pinecrest, Kendall and Palmetto Bay (33156, 33183, 33186). Mow, edge, blow. One flat price per visit from $45. Same crew, no contracts. Book in about 2 minutes.",
    canonical: "https://jointidy.co/lawn-care",
    priceRange: "$45–$99",
  },
};

const LawnCarePage = () => <ServiceLandingPage config={config} />;
export default LawnCarePage;
