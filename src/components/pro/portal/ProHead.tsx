/**
 * Shared head for every Pro Portal screen.
 *
 * Points the home-screen icon at the Pro-specific mark (navy shield + gold PRO)
 * so a Pro who saves the sign-in page gets the Pro app icon, not the customer
 * favicon. Also keeps the portal out of search results.
 */
import { Helmet } from "react-helmet-async";

export default function ProHead({ title }: { title: string }) {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="robots" content="noindex, nofollow" />
      <meta name="theme-color" content="#0F172A" />
      <link rel="apple-touch-icon" sizes="180x180" href="/pro-apple-touch-icon.png" />
      <link rel="icon" type="image/png" sizes="512x512" href="/pro-icon-512.png" />
      <link rel="icon" type="image/png" sizes="192x192" href="/pro-icon-192.png" />
      <link rel="mask-icon" href="/pro-icon.svg" color="#0F172A" />
      <meta name="apple-mobile-web-app-title" content="Tidy Pro" />
    </Helmet>
  );
}

/** Small Pro badge lockup used in the portal's app bars and entry screens. */
export function ProMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/pro-icon-512.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-[22%] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
