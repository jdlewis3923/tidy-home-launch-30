import ServiceLandingPage, { ServiceLandingConfig } from "@/components/landing/ServiceLandingPage";
import heroImg from "@/assets/lp-house-cleaning.jpg";
import heroImgWebp from "@/assets/lp-house-cleaning.webp";
import heroImgMobile from "@/assets/lp-house-cleaning-mobile.jpg";
import heroImgMobileWebp from "@/assets/lp-house-cleaning-mobile.webp";

// Every card price below is the SIZE-1 price, which is why each card says
// "From" and carries the size qualifier. Size 2 is $189 and size 3 is $279 a
// visit — see the FAQ and the pricing table.
const SIZE_NOTE = "size 1 home — sizes 2 and 3 cost more, see sizes below";

const config: ServiceLandingConfig = {
  serviceSlug: "house-cleaning",
  signupServiceParam: "cleaning",
  eyebrow: "House Cleaning",
  h1: "Monthly House Cleaning in Pinecrest + Kendall",
  subhead:
    "Professional house cleaning, handled for you. Weekly, biweekly, or monthly.",
  intentConfirm:
    "Same Pro every visit. Locked monthly price. Cancel anytime.",
  systemBridge:
    "Tidy isn't just cleaning — it's a system for your entire home.",
  ctaPrimaryLabel: "Book your cleaning",
  ctaPlanLabel: "Start your plan",
  priceAnchor: "From $139 a visit",
  stickyLabel: "House Cleaning · from $139 a visit",
  savingsCallout:
    "One-off cleanings in Pinecrest average **$180–$260**. Our plans start at **$139 a visit** — with the same Pro every time.",
  heroImage: heroImg,
  heroImageWebp: heroImgWebp,
  heroImageMobile: heroImgMobile,
  heroImageMobileWebp: heroImgMobileWebp,
  heroDimensions: [1920, 1080],
  heroMobileDimensions: [900, 1599],
  heroAlt: "Bright, freshly cleaned modern Miami living room",
  plans: [
    {
      name: "Monthly",
      price: "$139",
      cadence: "/mo",
      planSlug: "monthly",
      description: "One visit per month, same Pro every time.",
      isFromPrice: true,
      sizeNote: SIZE_NOTE,
      priceValue: 139,
      size: 1,
      cadenceKey: "monthly",
    },
    {
      name: "Biweekly",
      price: "$278",
      cadence: "/mo",
      planSlug: "biweekly",
      description: "Two visits per month, priority scheduling.",
      highlighted: true,
      isFromPrice: true,
      sizeNote: SIZE_NOTE,
      priceValue: 278,
      size: 1,
      cadenceKey: "biweekly",
    },
    {
      name: "Weekly",
      price: "$556",
      cadence: "/mo",
      planSlug: "weekly",
      description: "Weekly visits, dedicated Pro, quarterly deep-clean.",
      isFromPrice: true,
      sizeNote: SIZE_NOTE,
      priceValue: 556,
      size: 1,
      cadenceKey: "weekly",
    },
  ],
  included: [
    "Dust all surfaces",
    "Vacuum + mop all floors",
    "Kitchen deep-clean",
    "Bathroom disinfect",
    "Bedroom tidy + linen change",
    "Trash out",
    "Eco-safe products",
    "Same Pro every visit",
    "Photo-verified after every visit",
  ],
  addOnsNote: "Available as add-ons: inside oven, inside fridge, interior windows, deep baseboard scrub, laundry (wash/dry/fold), inside kitchen cabinets.",
  surchargeNote:
    "Extra-large home (2,501–4,000 sq ft): +$60 per visit. Above that size we quote individually.",
  trustCards: [
    {
      title: "Same Pro",
      body: "Your same pro every visit, not a rotating marketplace roster.",
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
      a: "One flat price per visit, set by the size of your home: $139, $189 or $279. How often we come just multiplies it — monthly is one visit, biweekly two, weekly four. Homes with 5+ bedrooms are quoted by hand.",
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
      a: "Kitchen deep-clean, bathroom disinfect, dusting all surfaces, vacuum and mop all floors, bedroom tidy, linen change, and trash out — using eco-safe products.",
    },
    {
      q: "Who does the cleaning?",
      a: "Screened professionals. Same Pro every visit so they learn your home.",
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
    title: "Already booking cleaning? Add lawn care from $45 a visit.",
    body: "Add a 2nd service and you pick one free premium add-on every month — and you never coordinate two providers again.",
    targetServices: "cleaning,lawn",
  },
  seo: {
    title: "House Cleaning in Pinecrest + Kendall | Tidy Home Concierge",
    description:
      "House cleaning in Pinecrest and Kendall (33156, 33183, 33186). One flat price per visit from $139. Same Pro, no contracts, eco-safe. Book in about 2 minutes.",
    canonical: "https://jointidy.co/house-cleaning",
    priceRange: "$139–$279",
    service: {
      name: "House Cleaning",
      serviceType: "House Cleaning",
      description:
        "Recurring house cleaning in Pinecrest and Kendall. One flat price per visit set by the size of your home.",
      offers: [
        { name: "Size 1 home (up to 2 bedrooms)", price: 139, unit: "visit" },
        { name: "Size 2 home (3 bedrooms)", price: 189, unit: "visit" },
        { name: "Size 3 home (4 bedrooms)", price: 279, unit: "visit" },
      ],
    },
  },
};

const HouseCleaningPage = () => <ServiceLandingPage config={config} />;
export default HouseCleaningPage;
