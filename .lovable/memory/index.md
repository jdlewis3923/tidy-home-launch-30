# Project Memory

## Core
Miami focus (ZIPs 33156, 33183, 33186).
Inter typography site-wide. Marketing: primary blue #2563eb, navy bg #0f172a, gold CTA #f5c518.
Auth/checkout/dashboard surfaces use the Apple-calm "control center" palette: cream #F8F6F2 paper, navy #0F172A ink, hairline grey dividers, soft warm Miami-daylight glows. No gold on these surfaces. Lowercase Apple-tone copy.
Never show platform badges (e.g., Edit with Lovable). EN/ES bilingual support required.
Copywriting must be concise, low cognitive load. Never use words like "easy" or "convenient".
Supabase auth, GTM tracking.

## Memories
- [Project Overview](mem://project/overview) — Tidy Home Concierge LLC business details and target Miami zip codes
- [Branding Colors](mem://style/branding-colors) — Core brand colors and typography settings
- [Logo Guidelines](mem://style/logo-guidelines) — Circular badge styling, sunburst, gradient, and layout containers
- [Button Styles](mem://style/ui-elements/buttons) — Glowing gold CTAs and specific pulsing animations for final CTA
- [Calm Checkout Surface](mem://style/calm-checkout) — Cream/ink palette, oversized logo, lowercase microcopy, CalmShell + ProgressBar conventions for /dashboard/plan, /login, /forgot-password, /reset-password, /dashboard/confirmation, /account
- [Lead Capture Popup](mem://features/lead-capture-popup) — Exit-intent/on-load trigger logic and A2P SMS consent rules
- [Service Pricing](mem://features/service-pricing) — Specific tiered pricing for cleaning, lawn, car, and bundle discounts
- [Webhooks](mem://technical/integrations/webhooks) — Zapier production webhook payload for lead submissions
- [Compliance Pages](mem://legal/compliance-pages) — A2P SMS privacy requirements for ToS and Privacy Policy
- [Footer Layout](mem://style/footer-layout) — Zip code highlights and logo placement in footer
- [Animations](mem://style/animations) — Restrained animation system, fade-ups only, explicit static elements
- [FAQ Style](mem://content/faq-style) — Reassuring header text and concise, upbeat answer tone
- [Final CTA Layout](mem://style/layout/final-cta) — Specific copy and max-size logo layout for final conversion section
- [How It Works UI](mem://features/how-it-works-ui) — Gradient cards, gold badges, and specific Lucide-React icons
- [Testimonials Carousel](mem://features/testimonials-carousel) — Infinite horizontal looping ticker for 5-star reviews
- [Visual Assets](mem://style/visual-assets) — Object positioning for hero imagery and navy-overlay luxury background for reviews
- [Branding Constraints](mem://technical/deployment/branding-constraints) — Multi-layered suppression of platform badges via CSS/MutationObserver
- [Favicon](mem://style/favicon) — Simplified flat brand mark design constraints
- [Language Support](mem://features/multi-language-support) — Global EN/ES translation context and auto-detection
- [Copywriting Strategy](mem://content/copywriting-strategy) — Messaging rules, 2-line max microcopy, no redundant adjectives
- [Hero Messaging](mem://content/messaging/hero) — Specific copy for Hero section emphasizing total service management
- [Project Status](mem://project/status) — Hybrid launch state definition and current CTA routing
- [Navbar Layout](mem://style/layout/navbar) — Oversized logo, hamburger menu, and right-aligned CTA/Login placement
- [Tracking Events](mem://technical/integrations/tracking) — GTM configuration, custom dataLayer events for clicks and conversions
- [Customer Dashboard](mem://features/customer-dashboard) — 7-step plan builder structure and dynamic menu system
- [Dashboard Feature Flag](mem://features/dashboard-feature-flag) — Toggling between pre-launch and functional platform modes
- [Authentication](mem://auth/customer-authentication) — Supabase configuration, password rules, and route protection
- [Launch Content Expansion](mem://features/launch-content-expansion) — Extra content layers shown when dashboard flag is enabled
