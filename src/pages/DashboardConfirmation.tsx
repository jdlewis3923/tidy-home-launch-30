import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import tidyLogo from '@/assets/tidy-logo.png';

/**
 * Calm "you're in." moment. Full-screen cream paper, sunlit blur, oversized
 * logo, no clutter. Reinforces: the right decision is already made.
 */
export default function DashboardConfirmation() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-cream text-ink">
      {/* Warm sunlit background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(36_70%_92%)_0%,hsl(36_27%_96%)_55%,hsl(35_22%_92%)_100%)]" />
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 h-[640px] w-[640px] rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, hsl(38 85% 86% / 0.9) 0%, transparent 65%)',
            filter: 'blur(70px)',
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-1/2 opacity-50"
          style={{
            background: 'radial-gradient(ellipse at bottom, hsl(217 60% 90% / 0.7) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-xl px-5 py-16 md:py-24 flex flex-col items-center text-center">
        <img
          src={tidyLogo}
          alt="Tidy"
          className="h-32 md:h-40 w-auto drop-shadow-[0_8px_24px_rgba(15,23,42,0.12)] animate-calm-rise"
        />

        <div className="mt-10 animate-calm-rise" style={{ animationDelay: '120ms' }}>
          <h1 className="text-5xl md:text-6xl font-bold text-ink tracking-tight lowercase" style={{ letterSpacing: '-0.03em' }}>
            you're in.
          </h1>
          <p className="mt-4 text-base md:text-lg text-ink-soft lowercase">
            your home is now on the schedule.
          </p>
        </div>

        <div
          className="mt-10 w-full max-w-md rounded-2xl border border-hairline bg-white/80 p-6 backdrop-blur shadow-[0_8px_32px_-16px_hsl(var(--ink)/0.18)] animate-calm-rise"
          style={{ animationDelay: '240ms' }}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">what happens next</p>
          <ol className="mt-4 space-y-3 text-sm text-ink-soft text-left">
            {[
              'check your email — your account login is on the way.',
              'we\'ll text you 24 hours before your first visit.',
              'your pro will text when they\'re on the way.',
              'after every visit — photos, and a chance to rate.',
            ].map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-ink-faint tabular-nums w-4">{i + 1}.</span>
                <span className="lowercase">{line}</span>
              </li>
            ))}
          </ol>
        </div>

        <Link
          to="/dashboard"
          className="mt-10 group inline-flex items-center gap-2 rounded-xl bg-ink px-7 py-4 text-sm font-semibold text-white lowercase shadow-[0_14px_40px_-12px_hsl(var(--ink)/0.5)] transition-all hover:shadow-[0_22px_48px_-12px_hsl(var(--ink)/0.6)] hover:-translate-y-0.5 animate-calm-rise"
          style={{ animationDelay: '360ms' }}
        >
          view dashboard
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <p className="mt-6 text-[11px] text-ink-faint lowercase animate-calm-in" style={{ animationDelay: '480ms' }}>
          we show up. done right.
        </p>
      </div>
    </div>
  );
}
