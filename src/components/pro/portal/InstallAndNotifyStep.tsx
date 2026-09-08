/**
 * Onboarding step: put Tidy on the home screen, then turn notifications on.
 *
 * This is a real step, not a nicety: on iPhone, notifications only work once
 * the Pro Portal has been added to the home screen and opened from there.
 * Safari will not deliver them to an ordinary browser tab. Android works
 * straight from the browser.
 */
import { Share, Smartphone, CheckCircle2, Circle } from "lucide-react";
import PushOptIn from "@/components/pro/portal/PushOptIn";
import { isStandalone, pushState } from "@/lib/pro-push";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function InstallAndNotifyStep({ stepNumber }: { stepNumber?: number }) {
  const state = pushState();
  const installed = isStandalone();
  const done = state === "granted";

  return (
    <div className={`rounded-2xl border p-5 ${done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start gap-4">
        <div className={`mt-0.5 ${done ? "text-emerald-600" : "text-slate-400"}`}>
          {done ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            {stepNumber ? <span>Step {stepNumber}</span> : <span>Set up your phone</span>}
            {done && <span className="text-emerald-700">· Complete</span>}
          </div>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-navy">
            <span className="text-primary"><Smartphone className="h-5 w-5" /></span>
            Put Tidy on your home screen and turn on notifications
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Job alerts come to you here, in this app — not by text. Open Tidy from your home
            screen so they reach you.
          </p>

          {isIos() && !installed && (
            <div className="mt-3 rounded-xl border border-primary/25 bg-blue-50 p-4 text-sm text-navy">
              <p className="flex items-center gap-2 font-semibold">
                <Share className="h-4 w-4 text-primary" aria-hidden /> On iPhone, do this first
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700">
                <li>Tap the Share button in Safari.</li>
                <li>Choose <strong>Add to Home Screen</strong>.</li>
                <li>Open Tidy from the new icon, then come back to this step.</li>
              </ol>
              <p className="mt-2 text-xs text-slate-600">
                iPhone only sends notifications to the home-screen app, never to a Safari tab.
              </p>
            </div>
          )}

          {!isIos() && (
            <p className="mt-2 text-xs text-slate-600">
              On Android you can turn them on right here. Adding Tidy to your home screen still
              makes it faster to open.
            </p>
          )}

          <div className="mt-3">
            <PushOptIn compact />
          </div>
        </div>
      </div>
    </div>
  );
}
