import { useEffect, useMemo } from "react";
import { PHONE_TEL, SERVICE_ZIPS } from "@/lib/landing";

export interface SeoFaq {
  q: string;
  a: string;
}

export interface SeoOffer {
  /** e.g. "Size 1 home" */
  name: string;
  /** numeric price, no currency symbol */
  price: number;
  /** "per visit" services use UnitPriceSpecification referenceQuantity */
  unit: "visit" | "month";
}

export interface SeoService {
  /** e.g. "House Cleaning" */
  name: string;
  description: string;
  /** schema.org serviceType */
  serviceType: string;
  offers: SeoOffer[];
}

interface SeoHeadProps {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  /** Service-specific JSON-LD price range, e.g. "$45–$279". */
  priceRange?: string;
  noindex?: boolean;
  /**
   * Built from the SAME array the FAQ section renders, so the rendered Q&A and
   * the FAQPage markup can never drift apart.
   */
  faqs?: SeoFaq[];
  service?: SeoService;
  /** Breadcrumb trail, root first. */
  breadcrumb?: { name: string; url: string }[];
}

/**
 * Per-LP SEO head: title, meta description, canonical, OG image, and a
 * JSON-LD @graph containing LocalBusiness, Service + Offers, FAQPage and
 * BreadcrumbList.
 *
 * NEVER add AggregateRating or Review here. We have zero customers; rating
 * markup without real reviews is a manual-action risk.
 */
const SeoHead = ({
  title,
  description,
  canonical,
  ogImage,
  priceRange = "$$",
  noindex = false,
  faqs,
  service,
  breadcrumb,
}: SeoHeadProps) => {
  const jsonLd = useMemo(() => {
    const businessId = "https://jointidy.co/#business";
    const graph: Record<string, unknown>[] = [
      {
        "@type": "LocalBusiness",
        "@id": businessId,
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
      },
    ];

    if (service) {
      graph.push({
        "@type": "Service",
        "@id": `${canonical}#service`,
        name: service.name,
        serviceType: service.serviceType,
        description: service.description,
        provider: { "@id": businessId },
        areaServed: SERVICE_ZIPS.map((zip) => ({
          "@type": "PostalCodeArea",
          postalCode: zip,
          addressCountry: "US",
        })),
        offers: service.offers.map((offer) => ({
          "@type": "Offer",
          name: offer.name,
          priceCurrency: "USD",
          price: offer.price,
          availability: "https://schema.org/InStock",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: offer.price,
            priceCurrency: "USD",
            unitText: offer.unit === "visit" ? "per visit" : "per month",
          },
        })),
      });
    }

    if (faqs?.length) {
      graph.push({
        "@type": "FAQPage",
        "@id": `${canonical}#faq`,
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      });
    }

    if (breadcrumb?.length) {
      graph.push({
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: breadcrumb.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          item: item.url,
        })),
      });
    }

    return { "@context": "https://schema.org", "@graph": graph };
  }, [breadcrumb, canonical, description, faqs, priceRange, service]);

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
