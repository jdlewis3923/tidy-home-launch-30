import ServiceLandingPage, { ServiceLandingConfig } from "@/components/landing/ServiceLandingPage";
import heroImg from "@/assets/lp-car-detailing.jpg";
import heroImgWebp from "@/assets/lp-car-detailing.webp";
import heroImgMobile from "@/assets/lp-car-detailing-mobile.jpg";
import heroImgMobileWebp from "@/assets/lp-car-detailing-mobile.webp";


const config: ServiceLandingConfig = {
  serviceSlug: "car-detailing",
  signupServiceParam: "detailing",
  eyebrow: "Car Detailing",
  h1: "Mobile Car Detailing in Pinecrest + Kendall",
  subhead: "Professional car detailing at your home. Ceramic-safe, monthly.",
  intentConfirm: "Same detailer every visit. Locked monthly price. Cancel anytime.",
  systemBridge: "Tidy isn't just detailing — it's a system for your entire home.",
  ctaPrimaryLabel: "Book detailing",
  ctaPlanLabel: "Start your plan",
  priceAnchor: "From $149/mo",
  stickyLabel: "Shine Complete · from $149/mo",
  savingsCallout:
    "A good mobile detail runs **$120–$180 per appointment**. Shine Complete is **$149/mo** for 3 maintenance washes a month plus 2 full details a year — in your driveway.",
  heroImage: heroImg,
  heroImageMobile: heroImgMobile,
  heroAlt: "Pristine freshly detailed black SUV in a Miami driveway",
  plans: [
    {
      name: "Shine Complete · Size 1",
      price: "$149",
      cadence: "/mo",
      planSlug: "monthly",
      description: "Sedans and coupes. 3 washes a month plus 2 full details a year.",
    },
    {
      name: "Shine Complete · Size 2",
      price: "$179",
      cadence: "/mo",
      planSlug: "monthly",
      description: "Crossovers and 2-row SUVs. Same flat monthly price.",
      highlighted: true,
    },
    {
      name: "Shine Complete · Size 3",
      price: "$239",
      cadence: "/mo",
      planSlug: "monthly",
      description: "Trucks, 3-row SUVs and vans.",
    },
  ],
  included: [
    "Exterior hand wash",
    "Ceramic-safe process",
    "Wheel + tire dress",
    "Interior vacuum",
    "Dashboard + console wipe",
    "Interior + exterior glass",
    "In your driveway",
    "Background-checked pros",
  ],
  addOnsNote: "Available as add-ons: pet hair removal, clay bar & ceramic coat, headlight restoration, interior protect & condition.",
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
      a: "Shine Complete is one flat monthly price set by what you drive: $149, $179 or $239. Every plan is 3 maintenance washes a month plus 2 full details a year.",
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
      q: "What's actually included?",
      a: "Exterior hand wash with ceramic-safe products, wheel and tire dress, interior vacuum, dashboard and console wipe-down, and interior + exterior glass. Pet hair removal, clay bar & ceramic coat, headlight restoration, and interior protect & condition are available as add-ons.",
    },
    {
      q: "Who does the detailing?",
      a: "Vetted, background-checked detailers. Same detailer every visit so they learn your vehicle.",
    },
    {
      q: "What about oversized or commercial vehicles?",
      a: "3-row SUVs, full-size trucks and vans are size 3 at $239/mo — a size, never a surcharge. Commercial vans and lifted trucks we price by hand.",
    },
    {
      q: "What if I'm not satisfied?",
      a: "Reach out within 24 hours and we'll send the detailer back or credit your account — no questions asked.",
    },
  ],
  bundleCta: {
    title: "Already on Shine Complete? Add cleaning from $139 a visit.",
    body: "Add a 2nd service and you pick one free premium add-on every month — and you never coordinate two providers again.",
    targetServices: "detailing,cleaning",
  },
  seo: {
    title: "Car Detailing in Pinecrest + Kendall | Tidy Home Concierge",
    description:
      "Shine Complete mobile car care in Pinecrest, Kendall and Palmetto Bay (33156, 33183, 33186). 3 washes a month plus 2 full details a year, from $149/mo. Book in about 2 minutes.",
    canonical: "https://jointidy.co/car-detailing",
    priceRange: "$149–$239",
  },
};

const CarDetailingPage = () => <ServiceLandingPage config={config} />;
export default CarDetailingPage;
