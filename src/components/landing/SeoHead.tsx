import { useEffect } from "react";
import { PHONE_TEL, SERVICE_ZIPS } from "@/lib/landing";

interface SeoHeadProps {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  /** Service-specific JSON-LD price range, e.g. "$85–$459". */
  priceRange?: string;
  noindex?: boolean;
}

/**
 * Per-LP SEO head: title, meta description, canonical, OG image, and
 * LocalBusiness JSON-LD scoped to the 3 ZIPs we actually serve.
 */
const SeoHead = ({ title, description, canonical, ogImage, priceRange = "$$", noindex = false }: SeoHeadProps) => {
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
  };

  useEffect(() => {
    document.title = title;

    const upsertMeta = (attribute: "name" | "property", key: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.content = content;
      element.dataset.tidySeo = "true";
    };

    let canonicalElement = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalElement) {
      canonicalElement = document.createElement("link");
      canonicalElement.rel = "canonical";
      document.head.appendChild(canonicalElement);
    }
    canonicalElement.href = canonical;
    canonicalElement.dataset.tidySeo = "true";

    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:type", "website");
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);

    const optionalMeta = (
      attribute: "name" | "property",
      key: string,
      content: string | undefined,
    ) => {
      if (content) upsertMeta(attribute, key, content);
      else document.head.querySelector(`meta[${attribute}="${key}"][data-tidy-seo="true"]`)?.remove();
    };
    optionalMeta("property", "og:image", ogImage);
    optionalMeta("name", "twitter:image", ogImage);
    optionalMeta("name", "robots", noindex ? "noindex, nofollow" : undefined);

    let structuredData = document.head.querySelector<HTMLScriptElement>('script[data-tidy-seo="json-ld"]');
    if (!structuredData) {
      structuredData = document.createElement("script");
      structuredData.type = "application/ld+json";
      structuredData.dataset.tidySeo = "json-ld";
      document.head.appendChild(structuredData);
    }
    structuredData.textContent = JSON.stringify(jsonLd);
  }, [canonical, description, jsonLd, noindex, ogImage, title]);

  return null;
};

export default SeoHead;
