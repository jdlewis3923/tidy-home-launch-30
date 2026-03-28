import { useState, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import AnnouncementTicker from "@/components/AnnouncementTicker";
import Hero from "@/components/Hero";
import ProofBar from "@/components/ProofBar";
import TrustBar from "@/components/TrustBar";
import Services from "@/components/Services";
import HowItWorks from "@/components/HowItWorks";
import BeforeAfter from "@/components/BeforeAfter";
import WhoItsFor from "@/components/WhoItsFor";
import Testimonials from "@/components/Testimonials";
import WhyTidy from "@/components/WhyTidy";
import PricingTable from "@/components/PricingTable";
import FAQ from "@/components/FAQ";
import ZipChecker from "@/components/ZipChecker";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import LeadPopup from "@/components/LeadPopup";
import { useNavigate } from "react-router-dom";

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
    </div>
  );
};

export default Index;
