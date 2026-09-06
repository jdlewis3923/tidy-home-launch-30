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
    // Offline app shell for the Pro Portal. Registration happens only in
    // src/lib/register-sw.ts, which refuses dev and Lovable preview hosts.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
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
            options: { cacheName: "tidy-pages", networkTimeoutSeconds: 3 },
          },
          {
            urlPattern: ({ url, request }) =>
              url.origin === (globalThis as unknown as { location: { origin: string } }).location.origin &&
              ["style", "script", "font"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "tidy-assets", expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url, request }) =>
              url.origin === (globalThis as unknown as { location: { origin: string } }).location.origin &&
              request.destination === "image",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "tidy-images", expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 } },
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
