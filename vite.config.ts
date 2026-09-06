import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Offline app shell for the Pro Portal only. A root-scoped worker made
    // Android treat the customer dashboard as the already-installed Pro app.
    // Registration is restricted to /pro/ in src/lib/register-sw.ts.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "pro-sw.js",
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        importScripts: ["push-sw.js"],
        // Precache only the app shell. Photos and hero art are big; caching
        // them up front made first load crawl, so they are cached lazily.
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
        globIgnores: ["**/*-mobile-*", "**/Admin*.js", "**/node_modules/**"],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "tidy-pro-pages", networkTimeoutSeconds: 1 },
          },
          {
            urlPattern: ({ url, request }) =>
              url.origin === (globalThis as unknown as { location: { origin: string } }).location.origin &&
              ["style", "script", "font"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "tidy-pro-assets", expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url, request }) =>
              url.origin === (globalThis as unknown as { location: { origin: string } }).location.origin &&
              request.destination === "image",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "tidy-pro-images", expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
        ],
      },
    }),
    // Separate customer worker. Keeping it under /dashboard gives Android a
    // second installable identity without letting it control the Pro Portal.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "home-sw.js",
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
        globIgnores: ["**/*-mobile-*", "**/Admin*.js", "**/node_modules/**"],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/(?!dashboard(?:\/|$))/, /^\/~oauth/],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "tidy-home-pages", networkTimeoutSeconds: 1 },
          },
          {
            urlPattern: ({ url, request }) =>
              url.origin === (globalThis as unknown as { location: { origin: string } }).location.origin &&
              ["style", "script", "font"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "tidy-home-assets", expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
