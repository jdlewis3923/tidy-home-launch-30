/**
 * /pro/review-bonus — standalone page hosting the ReviewBonusCard for Pros
 * who want the full-page view (e.g. linked from an email or the Pro nav).
 */
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ReviewBonusCard from "@/components/pro/ReviewBonusCard";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ProReviewBonuses() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <Helmet><title>{t("Review Bonus")} — Tidy</title></Helmet>
      <div className="mx-auto max-w-lg">
        <Link to="/pro" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy mb-6">
          <ArrowLeft className="h-4 w-4" /> {t("Back to dashboard")}
        </Link>
        <ReviewBonusCard />
      </div>
    </div>
  );
}
