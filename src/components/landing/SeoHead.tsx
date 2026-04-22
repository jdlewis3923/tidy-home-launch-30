import { Helmet } from "react-helmet-async";
import { PHONE_TEL, SERVICE_ZIPS } from "@/lib/landing";

interface SeoHeadProps {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  /** Service-specific JSON-LD price range, e.g. "$85–$459". */
  priceRange?: string;
}

/**
 * Per-LP SEO head: title, meta description, canonical, OG image, and
 * LocalBusiness JSON-LD scoped to the 3 ZIPs we actually serve.
 */
const SeoHead = ({ title, description, canonical, ogImage, priceRange = "$$" }: SeoHeadProps) => {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Tidy Home Concierge LLC",
    description,
    url: canonical,
    telephone: PHONE_TEL,
    email: "hello@jointidy.co",
    priceRange,
    areaServed: SERVICE_ZIPS.map((zip) => ({
      "@type": "PostalCodeArea",
      postalCode: zip,
      addressCountry: "US",
    })),
    address: {
      "@type": "PostalAddress",
      addressLocality: "Miami",
      addressRegion: "FL",
      addressCountry: "US",
    },
    sameAs: ["https://jointidy.co"],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "100",
    },
  };

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
};

export default SeoHead;
