/**
 * Pro push notifications — permission is only ever requested from a real tap.
 *
 * On iOS, push exists only when the app runs from the home screen, so we detect
 * standalone mode and explain that instead of firing a prompt that fails.
 */
import { supabase } from "@/integrations/supabase/client";

export type PushState =
  | "unsupported"
  | "ios_needs_install"
  | "default"
  | "granted"
  | "denied";

export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function pushState(): PushState {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "ios_needs_install" : "unsupported";
  }
  if (isIos() && !isStandalone()) return "ios_needs_install";
  return Notification.permission as PushState;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function vapidKey(): Promise<string | null> {
  const { data } = await supabase.functions.invoke("pro-push", { body: { action: "key" } });
  return (data as { vapid_public_key?: string } | null)?.vapid_public_key ?? null;
}

/** Called from a tap. Returns true when this device is subscribed. */
export async function enablePush(): Promise<boolean> {
  if (pushState() === "ios_needs_install" || pushState() === "unsupported") return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  return syncPushSubscription();
}

/**
 * Re-registers this device on every launch, so an expired subscription is
 * replaced rather than silently dropped. Safe to call when permission is
 * already granted; does nothing otherwise.
 */
export async function syncPushSubscription(): Promise<boolean> {
  try {
    if (pushState() !== "granted") return false;
    const reg = await navigator.serviceWorker.ready;
    const key = await vapidKey();
    if (!key) return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    const { data } = await supabase.functions.invoke("pro-push", {
      body: {
        action: "subscribe",
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth_key: json.keys.auth,
      },
    });
    return (data as { ok?: boolean } | null)?.ok === true;
  } catch {
    return false;
  }
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabase.functions.invoke("pro-push", {
      body: { action: "unsubscribe", endpoint: sub.endpoint },
    });
    await sub.unsubscribe();
  } catch {
    // best effort
  }
}
