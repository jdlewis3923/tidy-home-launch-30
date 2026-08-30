/**
 * Staging preview access.
 *
 * `?preview=TOKEN` is validated by the verify-preview-token edge function — the
 * expected value lives only in the PREVIEW_ACCESS_TOKEN secret, so no token ever
 * ships in the client bundle. A pass sets a SESSION cookie (no Expires, so it
 * dies with the browser session) and the site gate renders the real site instead
 * of ComingSoon. site_live stays false for everyone else.
 */

import { supabase } from "@/integrations/supabase/client";

const COOKIE = "tidy_preview";
const isBrowser = () => typeof document !== "undefined";

export function hasPreviewAccess(): boolean {
  if (!isBrowser()) return false;
  return document.cookie.split("; ").some((c) => c === `${COOKIE}=1`);
}

function grantPreviewAccess(): void {
  if (!isBrowser()) return;
  // Session cookie: omit Expires/Max-Age so it clears when the browser closes.
  document.cookie = `${COOKIE}=1; path=/; SameSite=Lax`;
}

/**
 * Read `?preview=` off the current URL and, if the token checks out server side,
 * open the site for the rest of this browser session. Returns true when access
 * was just granted (or already held).
 */
export async function redeemPreviewTokenFromUrl(): Promise<boolean> {
  if (!isBrowser()) return false;
  if (hasPreviewAccess()) return true;

  const token = new URLSearchParams(window.location.search).get("preview");
  if (!token) return false;

  try {
    const { data, error } = await supabase.functions.invoke("verify-preview-token", {
      body: { token },
    });
    if (error) return false;
    if ((data as { valid?: boolean } | null)?.valid === true) {
      grantPreviewAccess();
      return true;
    }
  } catch {
    /* network failure — fail closed, visitor keeps seeing ComingSoon */
  }
  return false;
}
