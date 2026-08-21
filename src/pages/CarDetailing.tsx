import ServiceLandingPage, { ServiceLandingConfig } from "@/components/landing/ServiceLandingPage";
import heroImg from "@/assets/lp-car-detailing.jpg";
import heroImgMobile from "@/assets/lp-car-detailing-mobile.jpg";

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
  priceAnchor: "Starting at $159/mo",
  stickyLabel: "Car Detailing · from $159/mo",
  savingsCallout:
    "A good mobile detail runs **$120–$180 per appointment**. Our subscription is **$159/mo** — and we come to your driveway.",
  heroImage: heroImg,
  heroImageMobile: heroImgMobile,
  heroAlt: "Pristine freshly detailed black SUV in a Miami driveway",
  plans: [
    {
      name: "Monthly",
      price: "$159",
      cadence: "/mo",
      planSlug: "monthly",
      description: "Interior + exterior, one vehicle.",
    },
    {
      name: "Biweekly",
      price: "$249",
      cadence: "/mo",
      planSlug: "biweekly",
      description: "Interior + exterior, every two weeks, one vehicle.",
      highlighted: true,
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
    "Fully insured",
  ],
  addOnsNote: "Available as add-ons: pet-hair removal, ozone treatment.",
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
      title: "Licensed & Insured",
      body: "Background-checked pros, insured on every Tidy job.",
    },
  ],

  faqs: [
    {
      q: "What's the price and what's it based on?",
      a: "Plans start at $159/mo for Monthly and $249/mo for Biweekly. Pricing is based on plan and vehicle size. Standard pricing covers sedans, coupes, crossovers, and 2-row SUVs.",
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
      a: "Exterior hand wash with ceramic-safe products, wheel and tire dress, interior vacuum, dashboard and console wipe-down, and interior + exterior glass. Pet-hair and ozone available as add-ons.",
    },
    {
      q: "Who does the detailing?",
      a: "Licensed, insured, background-checked detailers. Same detailer every visit so they learn your vehicle.",
    },
    {
      q: "What about oversized or commercial vehicles?",
      a: "3-row SUVs, full-size trucks, and large vans get a small upgrade fee. Commercial vans and lifted trucks need a quick custom quote — we'll handle it.",
    },
    {
      q: "What if I'm not satisfied?",
      a: "Reach out within 24 hours and we'll send the detailer back or credit your account — no questions asked.",
    },
  ],
  bundleCta: {
    title: "Already booking detailing? Add monthly cleaning for $159/mo.",
    body: "Save 10% when you stack — and never coordinate two providers again.",
    targetServices: "detailing,cleaning",
  },
  seo: {
    title: "Car Detailing in Pinecrest + Kendall | Tidy Home Concierge",
    description:
      "Mobile car detailing in Pinecrest and Kendall (33156, 33183, 33186). We come to your driveway. Ceramic-safe, locked price from $159/mo. Book in 60 seconds.",
    canonical: "https://jointidy.co/car-detailing",
    priceRange: "$159–$249",
  },
};

const CarDetailingPage = () => <ServiceLandingPage config={config} />;
export default CarDetailingPage;
