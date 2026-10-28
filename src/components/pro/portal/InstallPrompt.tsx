/**
 * "Add Tidy to your home screen" — shown once, after a Pro's first successful
 * sign in. Never shown again once dismissed, and never when the app is
 * already running standalone.
 */
import { useEffect, useState } from "react";
import { Share, Plus, X, SquarePlus } from "lucide-react";
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';

const KEY = "tidy_pro_install_prompt_dismissed_v2";

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function InstallPrompt() {
  const {language}=useLanguage();const es=language==='es';
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
        <Button
          variant="ghost" size="icon"
          onClick={dismiss}
          aria-label={es?'Cerrar':'Dismiss'}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full text-[hsl(var(--pro-ink-soft))]"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
        <p className="pr-8 text-[16px] font-extrabold text-[hsl(var(--pro-ink))]">
          {es?'Instalar Tidy Pro':'Install Tidy Pro'}
        </p>
        {ios ? (
          <ol className="mt-2 space-y-1.5 text-[14px] text-[hsl(var(--pro-ink-soft))]">
            <li className="flex items-center gap-2">
              <Share className="h-4 w-4 text-[hsl(var(--pro-blue))]" aria-hidden /> {es?'1. Toque Compartir':'1. Tap Share'}
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus className="h-4 w-4 text-[hsl(var(--pro-blue))]" aria-hidden /> {es?'2. Toque Agregar a inicio':'2. Tap Add to Home Screen'}
            </li>
          </ol>
        ) : (
          <ol className="mt-2 space-y-1.5 text-[14px] text-[hsl(var(--pro-ink-soft))]">
            <li className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-[hsl(var(--pro-blue))]" aria-hidden /> {es?'1. Abra el menú del navegador':'1. Tap the browser menu'}
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus className="h-4 w-4 text-[hsl(var(--pro-blue))]" aria-hidden /> {es?'2. Toque Instalar aplicación':'2. Tap Install app'}
            </li>
          </ol>
        )}
        <Button
          onClick={dismiss}
          className="mt-3 min-h-[44px] w-full rounded-xl bg-[hsl(var(--pro-navy))] text-[14px] font-bold text-white"
        >
          {es?'Entendido':'Got it'}
        </Button>
      </div>
    </div>
  );
}
