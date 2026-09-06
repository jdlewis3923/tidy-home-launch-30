/**
 * "Add Tidy to your home screen" — a calm, dismissible card for customers.
 *
 * Floats above the dashboard (fixed, bottom-right on desktop, full-width on
 * mobile) so the dashboard layout itself is untouched. Never shows once
 * dismissed, and never when already running as an installed app.
 */
import { useEffect, useState } from 'react';
import { Share, SquarePlus, X, Download, Sparkles } from 'lucide-react';

const KEY = 'tidy_home_install_prompt_dismissed_v2';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function HomeInstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(KEY)) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const t = setTimeout(() => setShow(true), 1400);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      clearTimeout(t);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(KEY, '1');
    setShow(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    dismiss();
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-full max-w-sm px-4 sm:inset-x-auto sm:right-6 sm:mx-0 sm:px-0">
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--hairline))]/70 bg-white/95 p-4 shadow-[0_18px_50px_-16px_rgba(15,23,42,0.35)] backdrop-blur">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[hsl(var(--primary))]/10 blur-2xl"
          aria-hidden
        />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-ink-soft transition hover:bg-cream"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="relative flex items-start gap-3">
          <img
            src="/home-icon-192.png"
            alt=""
            width={44}
            height={44}
            loading="lazy"
            className="shrink-0 rounded-[22%] shadow-sm"
          />
          <div className="pr-6">
            <p className="text-sm font-bold tracking-tight text-ink">Install Tidy Home</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              Customer app for your visits, plan and billing.
            </p>
          </div>
        </div>

        {ios ? (
          <ol className="relative mt-3 space-y-1.5 text-xs text-ink-soft">
            <li className="flex items-center gap-2">
              <Share className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden /> 1. Tap Share
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden /> 2. Tap
              Add to Home Screen
            </li>
          </ol>
        ) : deferred ? (
          <button
            type="button"
            onClick={install}
            className="relative mt-3 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-sm font-semibold text-white shadow-[0_10px_26px_-10px_hsl(var(--primary)/0.7)] transition hover:bg-[hsl(var(--primary-deep))]"
          >
            <Download className="h-4 w-4" aria-hidden /> Add to home screen
          </button>
        ) : (
          <ol className="relative mt-3 space-y-1.5 text-xs text-ink-soft">
            <li className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden /> 1. Open
              the browser menu
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden /> 2. Tap
              Install app
            </li>
          </ol>
        )}

        <button
          type="button"
          onClick={dismiss}
          className="relative mt-2 min-h-[36px] w-full text-xs font-semibold text-ink-soft transition hover:text-ink"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
