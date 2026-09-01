import ServiceLandingPage, { ServiceLandingConfig } from "@/components/landing/ServiceLandingPage";
import heroImg from "@/assets/lp-lawn-care.jpg";
import heroImgWebp from "@/assets/lp-lawn-care.webp";
import heroImgMobile from "@/assets/lp-lawn-care-mobile.jpg";
import heroImgMobileWebp from "@/assets/lp-lawn-care-mobile.webp";

// Card prices are the SIZE-1 lot price. Size 2 is $65 and size 3 is $99 a
// visit, which is why every card says "From" and carries this qualifier.
const SIZE_NOTE = "size 1 lot — sizes 2 and 3 cost more, see sizes below";


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
    "Most Pinecrest lawn pros charge **$40–$60 per visit** and re-quote you later. Tidy is **from $45 a visit** flat, same crew, no surprise invoices.",
  heroImage: heroImg,
  heroImageWebp: heroImgWebp,
  heroImageMobile: heroImgMobile,
  heroImageMobileWebp: heroImgMobileWebp,
  heroDimensions: [1920, 1122],
  heroAlt: "Freshly mowed striped emerald lawn at a Pinecrest home",
  plans: [
    {
      name: "Monthly",
      price: "$45",
      cadence: "/mo",
      planSlug: "monthly",
      description: "One visit per month.",
      isFromPrice: true,
      sizeNote: SIZE_NOTE,
      priceValue: 45,
      size: 1,
      cadenceKey: "monthly",
    },
    {
      name: "Biweekly",
      price: "$90",
      cadence: "/mo",
      planSlug: "biweekly",
      description: "Two visits per month.",
      highlighted: true,
      isFromPrice: true,
      sizeNote: SIZE_NOTE,
      priceValue: 90,
      size: 1,
      cadenceKey: "biweekly",
    },
    {
      name: "Weekly",
      price: "$180",
      cadence: "/mo",
      planSlug: "weekly",
      description: "Four visits per month.",
      isFromPrice: true,
      sizeNote: SIZE_NOTE,
      priceValue: 180,
      size: 1,
      cadenceKey: "weekly",
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
    "Locked price — never surprise-priced",
  ],
  addOnsNote: "Available as add-ons: weed removal, leaf & debris cleanup, bed edge reset, exterior windows & screens. Driveway pressure wash is specialist work, quoted separately.",
  surchargeNote:
    "Extra-large lot (4,001–7,500 sq ft of mowable turf): +$30 per visit. Above that size we quote individually.",

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
      a: "We serve Pinecrest and Kendall only. We are not currently serving other areas.",
    },
    {
      q: "What's actually included in a visit?",
      a: "Mowing to precise height, edging all borders, blowing all hardscapes, weed-whacking fence lines, and bagging or mulching clippings. A bed edge reset is available as an add-on.",
    },
    {
      q: "Who does the work?",
      a: "Background-checked crews. Same team every visit so your lawn stays consistent.",
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
      "Lawn care in Pinecrest and Kendall (33156, 33183, 33186). Mow, edge, blow. One flat price per visit from $45. Same crew, no contracts. Book in about 2 minutes.",
    canonical: "https://jointidy.co/lawn-care",
    priceRange: "$45–$99",
    service: {
      name: "Lawn Care",
      serviceType: "Lawn Care",
      description:
        "Recurring lawn care in Pinecrest and Kendall. One flat price per visit set by the size of your lot.",
      offers: [
        { name: "Size 1 lot (up to 2,000 sq ft turf)", price: 45, unit: "visit" },
        { name: "Size 2 lot (2,001–3,500 sq ft turf)", price: 65, unit: "visit" },
        { name: "Size 3 lot (3,501–5,000 sq ft turf)", price: 99, unit: "visit" },
      ],
    },
  },
};


const LawnCarePage = () => <ServiceLandingPage config={config} />;
export default LawnCarePage;
