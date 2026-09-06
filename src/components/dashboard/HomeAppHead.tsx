/**
 * Head for the customer command center.
 *
 * Points installability at the customer manifest (start_url /dashboard) and the
 * "TIDY HOME" icon, so a customer who adds Tidy to their home screen gets the
 * customer app — not the Pro Portal tile. index.html no longer hardcodes a
 * manifest link, so each area owns its own.
 */
import { Helmet } from 'react-helmet-async';

export default function HomeAppHead({ title = 'Your Tidy Home' }: { title?: string }) {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="robots" content="noindex, nofollow" />
      <link rel="manifest" href="/manifest-home.webmanifest" />
      <meta name="theme-color" content="#0070C2" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="Tidy Home" />
      <link rel="apple-touch-icon" sizes="180x180" href="/home-apple-touch-icon.png" />
      <link rel="icon" type="image/png" sizes="512x512" href="/home-icon-512.png" />
      <link rel="icon" type="image/png" sizes="192x192" href="/home-icon-192.png" />
    </Helmet>
  );
}
