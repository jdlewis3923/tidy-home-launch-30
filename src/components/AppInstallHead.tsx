import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const HOME_PATHS = ["/dashboard", "/account", "/billing", "/help"];

export default function AppInstallHead() {
  const { pathname } = useLocation();
  const isPro = pathname === "/pro" || pathname.startsWith("/pro/");
  const isHome = HOME_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!isPro && !isHome) return null;

  const manifest = isPro
    ? "/manifest-pro.webmanifest?v=20260906"
    : "/manifest-home.webmanifest?v=20260906";
  const color = isPro ? "#0F172A" : "#0070C2";
  const title = isPro ? "Tidy Pro" : "Tidy Home";
  const icon = isPro ? "/pro-apple-touch-icon.png" : "/home-apple-touch-icon.png";

  return (
    <Helmet>
      <link rel="manifest" href={manifest} />
      <meta name="theme-color" content={color} />
      <meta name="apple-mobile-web-app-title" content={title} />
      <link rel="apple-touch-icon" sizes="180x180" href={icon} />
    </Helmet>
  );
}