import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatRating, leadExcerpt, pickReview, relativeTime, shortName, useGoogleListing } from "@/lib/googleReviews";
import { Avatar, GoogleMark, Stars } from "./ReviewBits";

/** Quote result screen: one rating line, then one verbatim review. Renders nothing without real data. */
export default function QuoteReview({ services }: { services: string[] }) {
  const listing = useGoogleListing();
  const { t, language } = useLanguage();
  const review = useMemo(() => (listing ? pickReview(listing.reviews, services) : null), [listing, services]);
  if (!listing || !review) return null;
  const meta = [shortName(review.author), review.neighborhood, relativeTime(review, language)].filter(Boolean).join(" · ");

  return (
    <a
      href={review.review_uri || listing.maps_uri}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 block rounded-xl border border-hairline bg-white/60 p-4 transition-colors hover:bg-white"
      data-testid="quote-review"
    >
      <p className="flex items-center gap-2 text-[13px] text-ink">
        <Stars value={listing.rating} size={15} />
        <span className="font-semibold tabular-nums">{formatRating(listing.rating)}</span>
        <span className="text-ink-faint">·</span>
        <span className="text-ink-soft">
          {listing.total_count} {t(listing.total_count === 1 ? "review on Google" : "reviews on Google")}
        </span>
      </p>
      <p className="mt-3 text-[15px] leading-snug text-ink">“{leadExcerpt(review.text, 12, 12)}”</p>
      <div className="mt-3 flex items-center gap-2.5">
        <Avatar review={review} size={28} />
        <span className="flex-1 text-[12px] text-ink-faint">{meta}</span>
        <GoogleMark size={16} />
      </div>
    </a>
  );
}
