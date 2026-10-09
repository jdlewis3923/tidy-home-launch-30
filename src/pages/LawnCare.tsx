import ServiceLandingPage, { ServiceLandingConfig } from "@/components/landing/ServiceLandingPage";
import heroDesktopAsset from "@/assets/service-lawn-desktop.png.asset.json";
import heroMobileAsset from "@/assets/service-lawn-mobile.png.asset.json";

// Card prices are the SIZE-1 lot MONTHLY BILL. Size 2 and size 3 cost more,
// which is why every card says "From" and carries this qualifier.
const SIZE_NOTE = "Small lawn, up to 3,000 sq ft of grass — Standard (3,000–7,000) and Large (7,000–12,000) cost more";


const config: ServiceLandingConfig = {
  serviceSlug: "lawn-care",
  signupServiceParam: "lawn",
  eyebrow: "Lawn Care",
  h1: "Lawn Care in Pinecrest & Kendall",
  subhead:
    "Reliable lawn care, done right every time. Mow, edge, blow.",
  intentConfirm:
    "The same pro for each service, every visit. Locked monthly price. Cancel anytime.",
  systemBridge:
    "Tidy isn't just lawn — it's a system for your entire home.",
  ctaPrimaryLabel: "Reserve your spot",
  ctaPlanLabel: "Reserve your spot",
  priceAnchor: "From $45 a month",
  stickyLabel: "Lawn Care · from $45 a month",
  savingsCallout:
    "Most Pinecrest lawn pros charge **$40–$60 per visit** and re-quote you later. Tidy is **from $45 a month** flat, with the same pro for each service, every visit, and no surprise invoices.",
  heroImage: heroDesktopAsset.url,
  heroImageMobile: heroMobileAsset.url,
  heroDimensions: [1316, 876],
  heroMobileDimensions: [805, 1432],
  heroAlt: "Tidy lawn professional edging a manicured Pinecrest lawn",
  plans: [
    {
      name: "Monthly",
      price: "$45",
      cadence: "/mo",
      planSlug: "monthly",
      description: "One visit per month.",
      isFromPrice: true,
      visitNote: "1 visit a month · $45 a visit",
      sizeNote: SIZE_NOTE,
      priceValue: 45,
      size: 1,
      cadenceKey: "monthly",
    },
    {
      name: "Biweekly",
      price: "$82",
      cadence: "/mo",
      planSlug: "biweekly",
      description: "Two visits per month.",
      highlighted: true,
      isFromPrice: true,
      visitNote: "2 visits a month · $41 a visit",
      sizeNote: SIZE_NOTE,
      priceValue: 82,
      size: 1,
      cadenceKey: "biweekly",
    },
    {
      name: "Weekly",
      price: "$148",
      cadence: "/mo",
      planSlug: "weekly",
      description: "Four visits per month.",
      isFromPrice: true,
      visitNote: "4 visits a month · $37 a visit",
      sizeNote: SIZE_NOTE,
      priceValue: 148,
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
    "The same pro for each service, every visit",
    "Background-checked pros",
    "Locked price — never surprise-priced",
  ],
  addOnsNote: "Available as add-ons: weed removal, leaf & debris cleanup, bed edge reset.",
  surchargeNote:
    "Larger than 12,000 sq ft of grass? We quote it by hand — no price online.",

  trustCards: [
    {
      title: "Consistent specialist",
      body: "The same pro for each service, every visit.",
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
      a: "One price per visit, set by square feet of grass only — Small up to 3,000 sq ft ($45), Standard 3,000–7,000 ($65), Large 7,000–12,000 ($99) at the monthly plan. We don't count your house, driveway or pool; larger than 12,000 sq ft is a custom quote. Coming more often lowers the price per visit — biweekly is 8% less per visit than monthly, weekly is 18% less. You are always billed monthly. Pick your best guess — we check it from above and tell you before your first visit.",
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
      a: "Background-checked Pros. The same pro for each service, every visit.",
    },
    {
      q: "What if it rains?",
      a: "We automatically reschedule to the next available day. Your subscription stays active and your price doesn't change.",
    },
    {
      q: "What if I'm not satisfied?",
      a: "If anything about your visit isn't right, tell us within 48 hours and we'll send your pro back to fix it at no charge. No forms, no argument.",
    },
  ],
  bundleCta: {
    title: "Already booking lawn? Add cleaning from $139 a month.",
    body: "Add a 2nd service and you pick one free premium add-on every month — and you never coordinate two providers again.",
    targetServices: "lawn,cleaning",
  },
  seo: {
    title: "Lawn Care in Pinecrest + Kendall | Tidy Home Concierge",
    description:
      "Lawn care in Pinecrest and Kendall (33156, 33183, 33186). Mow, edge, blow. Plans from $45 a month. The same pro for each service, every visit. No contracts. Book in about 2 minutes.",
    canonical: "https://jointidy.co/lawn-care",
    priceRange: "$45–$324",
    service: {
      name: "Lawn Care",
      serviceType: "Lawn Care",
      description:
        "Recurring lawn care in Pinecrest and Kendall. One flat price per visit set by the size of your lot.",
      offers: [
        { name: "Small lawn (up to 3,000 sq ft of grass)", price: 45, unit: "visit" },
        { name: "Standard lawn (3,000–7,000 sq ft of grass)", price: 65, unit: "visit" },
        { name: "Large lawn (7,000–12,000 sq ft of grass)", price: 99, unit: "visit" },
      ],
    },
  },
};


const LawnCarePage = () => <ServiceLandingPage config={config} />;
export default LawnCarePage;
