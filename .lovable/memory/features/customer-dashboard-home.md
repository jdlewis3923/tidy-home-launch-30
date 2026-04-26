---
name: customer-dashboard-home
description: Live customer command center at /dashboard — calm, state-aware, replaces marketing landing
type: feature
---
The /dashboard route renders src/pages/DashboardIndex.tsx as a state-aware
"Home Operating System" command center (NOT a marketing landing).

Layout (matches reference image exactly):
- Top nav: DashboardTopNav (logo left; Dashboard/Services/Billing/Account/Help center;
  bell + avatar with initials right)
- Welcome strip with low-opacity hero wash, "welcome back, {first_name}." (name in primary blue)
- 4 summary cards: Next Visit (clickable → modal), Last Service, Next Billing, Plan
- 2-col grid: Schedule calendar (left, spans 2 of 3) + Upcoming Visits / Share & Save
  referral / "Stay in the know" notification card (right column)
- Recent Service photo card with "Photo proof" overlay + Completed badge
- Quick Actions row: Reschedule, Add Note, Update Access, Manage Plan,
  Payment Method, Help Center — all open CalmModal (no page redirects)

Service color system (calendar dots + list bullets):
- lawn → emerald-500
- cleaning → primary blue
- detailing → violet-500

Data: src/lib/dashboard-data.ts (useDashboardData) joins profiles +
subscriptions + visits + invoices for the authed user. Unauthed users
are bounced to /login. Empty plan state shows a calm "nothing scheduled
yet" CTA → /dashboard/plan.

Supporting components:
- src/components/dashboard/DashboardTopNav.tsx
- src/components/dashboard/ScheduleCalendar.tsx
- src/components/dashboard/CalmModal.tsx
