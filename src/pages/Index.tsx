import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { initScrollTracking, pushEvent } from "@/lib/tracking";
import Navbar from "@/components/Navbar";
import AnnouncementTicker from "@/components/AnnouncementTicker";
import Hero from "@/components/Hero";
import ProofBar from "@/components/ProofBar";
import { useNavigate } from "react-router-dom";

// Lazy-load below-fold sections
const TrustBar = lazy(() => import("@/components/TrustBar"));
const Services = lazy(() => import("@/components/Services"));
const HowItWorks = lazy(() => import("@/components/HowItWorks"));
const BeforeAfter = lazy(() => import("@/components/BeforeAfter"));
const WhoItsFor = lazy(() => import("@/components/WhoItsFor"));
const Testimonials = lazy(() => import("@/components/Testimonials"));
const WhyTidy = lazy(() => import("@/components/WhyTidy"));
const PricingTable = lazy(() => import("@/components/PricingTable"));
const FAQ = lazy(() => import("@/components/FAQ"));
const ZipChecker = lazy(() => import("@/components/ZipChecker"));
const FinalCTA = lazy(() => import("@/components/FinalCTA"));
const Footer = lazy(() => import("@/components/Footer"));
const LeadPopup = lazy(() => import("@/components/LeadPopup"));

const POPUP_DISMISS_KEY = "tidy_popup_dismissed";
const DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const Index = () => {
  const [popupOpen, setPopupOpen] = useState(false);
  const navigate = useNavigate();

  const canShowPopup = useCallback(() => {
    const dismissed = localStorage.getItem(POPUP_DISMISS_KEY);
    if (!dismissed) return true;
    return Date.now() - parseInt(dismissed) > DISMISS_DURATION;
  }, []);

  // Scroll depth tracking
  useEffect(() => {
    const cleanup = initScrollTracking();
    return cleanup;
  }, []);

  // Page view
  useEffect(() => {
    pushEvent("page_view", { page: "/" });
  }, []);

  // Auto-fire after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (canShowPopup()) setPopupOpen(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [canShowPopup]);

  // Exit intent
  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && canShowPopup() && !popupOpen) {
        setPopupOpen(true);
      }
    };
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [canShowPopup, popupOpen]);

  const openPopup = () => setPopupOpen(true);

  return (
    <div className="min-h-screen">
      <Navbar onOpenPopup={openPopup} />
      <AnnouncementTicker />
      <Hero onOpenPopup={openPopup} />
      <ProofBar />
      <Suspense fallback={null}>
        <TrustBar />
        <Services />
        <HowItWorks onOpenPopup={openPopup} />
        <BeforeAfter />
        <WhoItsFor />
        <Testimonials onOpenPopup={openPopup} />
        <WhyTidy />
        <PricingTable />
        <FAQ />
        <ZipChecker />
        <FinalCTA onOpenPopup={openPopup} />
        <Footer />

        <LeadPopup
          isOpen={popupOpen}
          onClose={() => setPopupOpen(false)}
          onSuccess={() => {
            setPopupOpen(false);
            navigate("/thank-you");
          }}
        />
      </Suspense>
    </div>
  );
};

export default Index;
