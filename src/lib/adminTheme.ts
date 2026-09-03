/**
 * Admin theme preference — Light / Dark / System.
 *
 * The choice is persisted per user (keyed by the signed-in user id, with an
 * anonymous fallback) and applied by toggling the `dark` class on <html>, so
 * every component that reads CSS custom properties follows automatically.
 * No component hardcodes a color.
 */

export type ThemeChoice = "light" | "dark" | "system";

const PREFIX = "tidy.admin.theme";

export function themeStorageKey(userId: string | null): string {
  return `${PREFIX}:${userId ?? "anon"}`;
}

/** Dark stays the default so the existing admin HUD look is unchanged. */
export const DEFAULT_THEME: ThemeChoice = "dark";

export function readThemeChoice(userId: string | null): ThemeChoice {
  try {
    const v = localStorage.getItem(themeStorageKey(userId));
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_THEME;
}

export function writeThemeChoice(userId: string | null, choice: ThemeChoice) {
  try {
    localStorage.setItem(themeStorageKey(userId), choice);
  } catch {
    /* storage unavailable */
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/** Apply (or clear) the dark token set on the document root. */
export function applyTheme(resolved: "light" | "dark" | null) {
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  if (resolved) root.dataset.adminTheme = resolved;
  else delete root.dataset.adminTheme;
}
