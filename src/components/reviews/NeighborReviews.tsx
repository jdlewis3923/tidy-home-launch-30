import { useLanguage } from "@/contexts/LanguageContext";
import { formatRating, leadExcerpt, rankReviews, relativeTime, shortName, useGoogleListing, type GoogleReview } from "@/lib/googleReviews";
import { Avatar, GoogleMark, Stars } from "./ReviewBits";

/**
 * Home page review section on deep navy. Hero pull-quote + staggered
 * supporting reviews (horizontal swipe on phones). No review schema markup —
 * displayed and linked only. Renders nothing without real reviews.
 */
export default function NeighborReviews() {
  const listing = useGoogleListing();
  const { t, language } = useLanguage();
  if (!listing) return null;
  const [hero, ...rest] = rankReviews(listing.reviews);
  if (!hero) return null;
  const support = rest.slice(0, 3);
  const lead = leadExcerpt(hero.text);
  const remainder = hero.text.trim().replace(/\s+/g, " ").slice(lead.replace(/…$/, "").length).trim();

  const Meta = ({ r, light = true }: { r: GoogleReview; light?: boolean }) => (
    <div className="flex items-center gap-3">
      <Avatar review={r} size={44} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${light ? "text-primary-foreground" : ""}`}>{shortName(r.author)}</p>
        <p className="text-xs text-primary-foreground/60">
          {[r.neighborhood, relativeTime(r, language)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );

  return (
    <section className="relative overflow-hidden bg-review-navy px-5 py-20 md:py-28" aria-labelledby="neighbor-reviews">
      <div className="mx-auto max-w-5xl">
        <a
          href={listing.maps_uri}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 rounded-full bg-primary-foreground/10 px-3.5 py-1.5 text-sm text-primary-foreground hover:bg-primary-foreground/15"
        >
          <GoogleMark size={16} />
          <Stars value={listing.rating} size={16} />
          <span className="font-semibold tabular-nums">{formatRating(listing.rating)}</span>
          <span className="text-primary-foreground/70">
            · {listing.total_count} {t(listing.total_count === 1 ? "review on Google" : "reviews on Google")}
          </span>
        </a>

        <h2 id="neighbor-reviews" className="mt-6 text-3xl font-bold tracking-tight text-primary-foreground md:text-5xl">
          {t("Neighbors who already use us.")}
        </h2>

        {/* Hero review */}
        <a href={hero.review_uri || listing.maps_uri} target="_blank" rel="noopener noreferrer" className="relative mt-12 block md:mt-16">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-2 -top-16 select-none font-serif text-[200px] leading-none text-review-yellow/15 md:-left-10 md:-top-24 md:text-[300px]"
          >
            “
          </span>
          <Stars value={hero.rating ?? 5} size={26} />
          <blockquote className="relative mt-5 max-w-4xl text-[28px] font-light leading-[1.3] text-primary-foreground md:text-[36px]">
            {lead}
          </blockquote>
          {remainder && <p className="relative mt-5 max-w-2xl text-base leading-relaxed text-primary-foreground/75">{remainder}</p>}
          <div className="relative mt-7">
            <Meta r={hero} />
          </div>
        </a>
        <a
          href={listing.maps_uri}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block text-sm font-semibold text-review-yellow underline-offset-4 hover:underline"
        >
          {t("Every review below is on our Google listing. Read them there →")}
        </a>

        {/* Supporting reviews: swipe on phones, staggered on desktop */}
        {support.length > 0 && (
          <div className="-mx-5 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:mt-16 md:block md:space-y-8 md:overflow-visible md:px-0">
            {support.map((r, i) => (
              <a
                key={r.id ?? i}
                href={r.review_uri || listing.maps_uri}
                target="_blank"
                rel="noopener noreferrer"
                className={[
                  "block w-[82%] shrink-0 snap-start rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.06] p-6 transition-colors hover:bg-primary-foreground/10",
                  "md:w-auto",
                  i === 0 ? "md:mr-auto md:max-w-[58%]" : i === 1 ? "md:ml-auto md:max-w-[52%] md:-mt-4" : "md:ml-[12%] md:max-w-[62%]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <Meta r={r} />
                  <GoogleMark size={18} />
                </div>
                <Stars value={r.rating ?? 5} size={18} className="mt-4" />
                <p className="mt-3 text-[15px] leading-relaxed text-primary-foreground/85">{r.text}</p>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
