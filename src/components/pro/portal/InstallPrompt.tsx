/**
 * "Add Tidy to your home screen" — shown once, after a Pro's first successful
 * sign in. Never shown again once dismissed, and never when the app is
 * already running standalone.
 */
import { useEffect, useState } from "react";
import { Share, Plus, X, SquarePlus } from "lucide-react";

const KEY = "tidy_pro_install_prompt_dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(KEY)) return;
    const t = setTimeout(() => setShow(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(KEY, "1");
    setShow(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-[84px] z-40 mx-auto max-w-md px-4">
      <div className="relative rounded-2xl border border-[hsl(var(--pro-blue)/0.25)] bg-white p-4 shadow-lg">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full text-[hsl(var(--pro-ink-soft))]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <p className="pr-8 text-[16px] font-extrabold text-[hsl(var(--pro-ink))]">
          Add Tidy to your home screen
        </p>
        {ios ? (
          <ol className="mt-2 space-y-1.5 text-[14px] text-[hsl(var(--pro-ink-soft))]">
            <li className="flex items-center gap-2">
              <Share className="h-4 w-4 text-[hsl(var(--pro-blue))]" aria-hidden /> 1. Tap Share
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus className="h-4 w-4 text-[hsl(var(--pro-blue))]" aria-hidden /> 2. Tap Add to Home Screen
            </li>
          </ol>
        ) : (
          <ol className="mt-2 space-y-1.5 text-[14px] text-[hsl(var(--pro-ink-soft))]">
            <li className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-[hsl(var(--pro-blue))]" aria-hidden /> 1. Tap the browser menu
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus className="h-4 w-4 text-[hsl(var(--pro-blue))]" aria-hidden /> 2. Tap Install app
            </li>
          </ol>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 min-h-[44px] w-full rounded-xl bg-[hsl(var(--pro-navy))] text-[14px] font-bold text-white"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
