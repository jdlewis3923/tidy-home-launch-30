import ServiceLandingPage, { ServiceLandingConfig } from "@/components/landing/ServiceLandingPage";
import heroDesktopAsset from "@/assets/service-cleaning-desktop.png.asset.json";
import heroMobileAsset from "@/assets/service-cleaning-mobile.png.asset.json";

// Every card price below is the SIZE-1 price, which is why each card says
// "From" and carries the size qualifier. Size 2 is $189 and size 3 is $279 a
// visit — see the FAQ and the pricing table.
const SIZE_NOTE = "Size 1 · up to 1,400 sq ft. Larger homes have their own price.";

const config: ServiceLandingConfig = {
  serviceSlug: "house-cleaning",
  signupServiceParam: "cleaning",
  eyebrow: "House Cleaning",
  h1: "House Cleaning in Pinecrest & Kendall",
  subhead:
    "Professional house cleaning, handled for you. Weekly, biweekly, or monthly.",
  intentConfirm:
    "The same pro for each service, every visit. Locked monthly price. Cancel anytime.",
  systemBridge:
    "Tidy isn't just cleaning — it's a system for your entire home.",
  ctaPrimaryLabel: "Reserve your spot",
  ctaPlanLabel: "Reserve your spot",
  priceAnchor: "From $139 a month",
  stickyLabel: "House Cleaning · from $139 a month",
  savingsCallout:
    "One-off cleanings in Pinecrest average **$180–$260**. Our plans start at **$139 a month** — with the same pro for each service, every visit.",
  heroImage: heroDesktopAsset.url,
  heroImageMobile: heroMobileAsset.url,
  heroDimensions: [1459, 972],
  heroMobileDimensions: [848, 1508],
  heroAlt: "Tidy cleaning professional caring for a modern Miami kitchen",
  plans: [
    {
      name: "Monthly",
      price: "$139",
      cadence: "/mo",
      planSlug: "monthly",
      description: "One visit per month, with the same pro for each service, every visit.",
      isFromPrice: true,
      visitNote: "1 visit a month · $139 a visit",
      sizeNote: SIZE_NOTE,
      priceValue: 139,
      size: 1,
      cadenceKey: "monthly",
    },
    {
      name: "Biweekly",
      price: "$256",
      cadence: "/mo",
      planSlug: "biweekly",
      description: "Two visits per month, priority scheduling.",
      highlighted: true,
      isFromPrice: true,
      visitNote: "2 visits a month · $128 a visit",
      sizeNote: SIZE_NOTE,
      priceValue: 256,
      size: 1,
      cadenceKey: "biweekly",
    },
    {
      name: "Weekly",
      price: "$456",
      cadence: "/mo",
      planSlug: "weekly",
      description: "Weekly visits, dedicated Pro, quarterly deep-clean.",
      isFromPrice: true,
      visitNote: "4 visits a month · $114 a visit",
      sizeNote: SIZE_NOTE,
      priceValue: 456,
      size: 1,
      cadenceKey: "weekly",
    },
  ],
  included: [], // Active service_scope supplies included rows and add-ons.
  surchargeNote:
    "Size 1 up to 1,400 sq ft; Size 2 up to 2,200; Size 3 up to 3,200; Estate up to 4,800; Estate Plus up to 7,000. Above 7,000: walkthrough quote.",
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
      body: "Every pro clears a Checkr criminal screen before their first visit.",
    },
  ],

  faqs: [
    {
      q: "What's the price and what's it based on?",
      a: "Square footage sets your cleaning size: Size 1 $139, Size 2 $189, Size 3 $279, Estate $425, Estate Plus $595 on the monthly plan. Every 2 weeks saves 8% per visit; weekly saves 18%. Prepay a year and save 10%. More bathrooms than your band's limit moves the home up one size. Above 7,000 sq ft needs a walkthrough quote.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. No contracts, no cancellation fees. Pause, skip, or cancel from your dashboard anytime.",
    },
    {
      q: "What's your service area?",
      a: "Pinecrest and Kendall only. We're not currently serving other areas.",
    },
    {
      q: "What's actually included in a visit?",
      a: "", // Filled from active service_scope in the shared page.
    },
    {
      q: "Who does the cleaning?",
      a: "Screened professionals. The same pro for each service, every visit.",
    },
    {
      q: "How is scheduling handled?",
      a: "After signup, we lock in a recurring day and time window. You'll get an ETA reminder before every visit. Reschedule anytime from your dashboard.",
    },
    {
      q: "What if I'm not satisfied?",
      a: "If anything about your visit isn't right, tell us within 48 hours and we'll send your pro back to fix it at no charge. No forms, no argument.",
    },
  ],
  bundleCta: {
    title: "Already booking cleaning? Add lawn care from $45 a month.",
    body: "Add a 2nd service and you pick one free premium add-on every month — and you never coordinate two providers again.",
    targetServices: "cleaning,lawn",
  },
  seo: {
    title: "House Cleaning + Deep Clean Add-On | Pinecrest & Kendall | Tidy",
    description:
      "Recurring house cleaning in Pinecrest and Kendall with a size-priced deep clean add-on for members. Weekly plans include a quarterly deep clean. No one-time cleans without a plan.",
    canonical: "https://jointidy.co/house-cleaning",
    priceRange: "$139–$595",
    service: {
      name: "House Cleaning",
      serviceType: "House Cleaning",
      description:
        "Recurring house cleaning in Pinecrest and Kendall. One flat price per visit set by the size of your home.",
      offers: [
        { name: "Size 1 home (up to 1,400 sq ft)", price: 139, unit: "visit" },
        { name: "Size 2 home (1,400–2,200 sq ft)", price: 189, unit: "visit" },
        { name: "Size 3 home (2,200–3,200 sq ft)", price: 279, unit: "visit" },
        { name: "Estate (3,200–4,800 sq ft)", price: 425, unit: "visit" },
        { name: "Estate Plus (4,800–7,000 sq ft)", price: 595, unit: "visit" },
      ],
    },
  },
};

const HouseCleaningPage = () => <ServiceLandingPage config={config} />;
export default HouseCleaningPage;
