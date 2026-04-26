---
name: Calm Checkout Surface
description: Apple-calm cream/ink design system for /dashboard/plan, /login, /forgot-password, /reset-password, /dashboard/confirmation, /account
type: design
---

The auth + checkout + post-checkout surfaces use a distinct "control center" aesthetic, separate from the marketing site's dark/gold style.

**Palette tokens (index.css):** `--cream` (#F8F6F2), `--cream-deep`, `--ink` (#0F172A navy), `--ink-soft`, `--ink-faint`, `--hairline` warm grey divider. Tailwind utilities: `bg-cream`, `text-ink`, `text-ink-soft`, `text-ink-faint`, `border-hairline`.

**Typography:** Inter site-wide. Headlines lowercase, tracking -0.025em, never tighter. Microcopy lowercase, ≤1 short line.

**Layout:** `CalmShell` component centers an oversized logo (h-32 md:h-40) with a Step N of M / microcopy strip. Single column, max-w-2xl, generous padding.

**Background:** Warm Miami daylight — radial cream gradient + soft sun glow blob top + faint blue glow bottom. No grain, no dot grid.

**Motion:** `animate-calm-in` (subtle fade+rise) and `animate-calm-rise` (longer, for hero blocks). No shimmer, no pulse, no shouty animations.

**CTAs:** `bg-ink text-white` with soft `0_14px_40px_-12px` ink shadow + 0.5px hover lift. No gold on these surfaces.

**Voice:** "your home, handled." / "set it once." / "we show up." / "done right." Used sparingly, never loud.
