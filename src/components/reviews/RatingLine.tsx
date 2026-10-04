import { useLanguage } from "@/contexts/LanguageContext";
import { formatRating, useGoogleListing } from "@/lib/googleReviews";
import { Stars } from "./ReviewBits";

/** Reservation screen: one reassurance line, no quote. */
export default function RatingLine() {
  const listing = useGoogleListing();
  const { t } = useLanguage();
  if (!listing) return null;
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-ink-soft" data-testid="rating-line">
      <Stars value={listing.rating} size={14} />
      <span>
        <span className="font-semibold text-ink tabular-nums">{formatRating(listing.rating)}</span> {t("from")}{" "}
        {listing.total_count} {t(listing.total_count === 1 ? "Google review" : "Google reviews")}
      </span>
      <span className="text-ink-faint">·</span>
      <a href={listing.maps_uri} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline-offset-4 hover:underline">
        {t("Read them →")}
      </a>
    </p>
  );
}
