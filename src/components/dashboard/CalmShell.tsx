import { ReactNode } from 'react';
import tidyLogo from '@/assets/tidy-logo.png';

interface Props {
  step: number;
  totalSteps: number;
  microcopy?: string;
  children: ReactNode;
}

/**
 * Calm Apple-style shell used by the checkout, login, and confirmation
 * surfaces. Cream paper background, oversized centered logo, soft warm
 * lighting cue. No clutter — the product is peace of mind.
 */
export default function CalmShell({ step, totalSteps, microcopy, children }: Props) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-cream text-ink">
      {/* Warm Miami daylight — barely-there gradient + soft sun glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(36_60%_94%)_0%,hsl(36_27%_96%)_55%,hsl(35_22%_92%)_100%)]" />
        <div
          className="absolute -top-40 right-1/4 h-[520px] w-[520px] rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, hsl(38 80% 88% / 0.85) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute -bottom-48 -left-32 h-[560px] w-[560px] rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, hsl(217 70% 92%) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      {/* Header — oversized logo, generous padding */}
      <header className="relative">
        <div className="mx-auto max-w-2xl px-5 pt-8 pb-2 flex flex-col items-center text-center">
          <a href="/" aria-label="Tidy">
            <img
              src={tidyLogo}
              alt="Tidy"
              className="h-44 md:h-56 w-auto drop-shadow-[0_10px_28px_rgba(15,23,42,0.14)]"
            />
          </a>
          {totalSteps > 0 && (
            <div className="mt-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.22em] text-ink-faint">
              <span>Step {step + 1} of {totalSteps}</span>
              <span aria-hidden className="h-px w-10 bg-hairline" />
              <span className="lowercase tracking-normal text-ink-faint/80 normal-case">
                {microcopy ?? 'set it once.'}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="relative mx-auto max-w-2xl px-5 pt-6 pb-32">
        {children}
      </main>
    </div>
  );
}
