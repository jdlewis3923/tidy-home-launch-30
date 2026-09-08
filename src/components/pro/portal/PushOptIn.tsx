/**
 * Push opt-in — permission is only ever asked from this button's tap.
 *
 * On iOS in a browser tab push doesn't exist, so we explain the home-screen
 * step instead of firing a prompt that silently fails. Declined once, never
 * auto-asked again; this control stays in Profile so it can be re-enabled.
 */
import { useEffect, useState } from "react";
import { BellRing, BellOff, Check, Share } from "lucide-react";
import { disablePush, enablePush, pushState, syncPushSubscription, type PushState } from "@/lib/pro-push";

export default function PushOptIn({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    setState(pushState());
    // Re-register on every launch so an expired subscription is replaced.
    void syncPushSubscription().then(setSubscribed);
  }, []);

  const turnOn = async () => {
    setBusy(true);
    const ok = await enablePush();
    setBusy(false);
    setState(pushState());
    setSubscribed(ok);
  };

  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setSubscribed(false);
  };

  const shell = compact
    ? "rounded-2xl border border-[hsl(var(--pro-blue)/0.25)] bg-white p-4"
    : "rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)] bg-white p-4 pro-card";

  if (state === "unsupported") {
    return (
      <div className={shell}>
        <p className="flex items-center gap-2 text-[15px] font-extrabold text-[hsl(var(--pro-ink))]">
          <BellOff className="h-4 w-4 text-[hsl(var(--pro-ink-soft))]" aria-hidden /> Enable job notifications
        </p>
        <p className="mt-1.5 text-[14px] text-[hsl(var(--pro-ink-soft))]">
          Notifications are not available in this browser. Open jointidy.co/pro in Safari or Chrome, add Tidy Pro to
          your home screen, then open the installed app and return here.
        </p>
      </div>
    );
  }


  if (state === "ios_needs_install") {
    return (
      <div className={shell}>
        <p className="flex items-center gap-2 text-[15px] font-extrabold text-[hsl(var(--pro-ink))]">
          <BellRing className="h-4 w-4 text-[hsl(var(--pro-blue))]" aria-hidden /> Enable job notifications
        </p>
        <p className="mt-1.5 flex items-start gap-2 text-[14px] text-[hsl(var(--pro-ink-soft))]">
          <Share className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--pro-blue))]" aria-hidden />
          Add Tidy to your home screen first, then open it from there to turn notifications on.
        </p>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className={shell}>
        <p className="flex items-center gap-2 text-[15px] font-extrabold text-[hsl(var(--pro-ink))]">
          <BellOff className="h-4 w-4 text-[hsl(var(--pro-ink-soft))]" aria-hidden /> Notifications are off
        </p>
        <p className="mt-1.5 text-[14px] text-[hsl(var(--pro-ink-soft))]">
          Turn them back on for Tidy in your phone's settings, then reopen the app.
        </p>
      </div>
    );
  }

  return (
    <div className={shell}>
      <p className="flex items-center gap-2 text-[15px] font-extrabold text-[hsl(var(--pro-ink))]">
        <BellRing className="h-4 w-4 text-[hsl(var(--pro-blue))]" aria-hidden /> Get notified when a visit is assigned
        to you
      </p>
      <p className="mt-1.5 text-[14px] text-[hsl(var(--pro-ink-soft))]">
        Also for payouts, bonuses and insurance reminders. You'll still get a text either way.
      </p>
      {subscribed ? (
        <button
          type="button"
          onClick={() => void turnOff()}
          disabled={busy}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--pro-navy)/0.15)] bg-white text-[14px] font-bold text-[hsl(var(--pro-ink))]"
        >
          <Check className="h-4 w-4 text-[hsl(var(--pro-green,142_71%_38%))]" aria-hidden /> Notifications on · turn off
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void turnOn()}
          disabled={busy}
          className="mt-3 min-h-[44px] w-full rounded-xl bg-[hsl(var(--pro-blue))] text-[14px] font-bold text-white disabled:opacity-60"
        >
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
      )}
    </div>
  );
}
