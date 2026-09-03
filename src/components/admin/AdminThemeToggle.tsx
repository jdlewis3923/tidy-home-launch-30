/**
 * AdminThemeToggle — Light / Dark / System switch in the admin header.
 *
 * Only paints tokens while on an /admin route; leaving admin restores the
 * site's own (light) palette so nothing outside admin changes behavior.
 */
import { useEffect, useState } from "react";
import { Sun, Moon, MonitorSmartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  type ThemeChoice, DEFAULT_THEME, readThemeChoice, writeThemeChoice,
  resolveTheme, applyTheme,
} from "@/lib/adminTheme";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: MonitorSmartphone },
];

export default function AdminThemeToggle({ active }: { active: boolean }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [choice, setChoice] = useState<ThemeChoice>(DEFAULT_THEME);

  // Resolve the signed-in user so the preference is stored per user.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      setChoice(readThemeChoice(uid));
    });
    return () => { cancelled = true; };
  }, []);

  // Paint tokens; follow the OS when the choice is System.
  useEffect(() => {
    if (!active) { applyTheme(null); return; }
    applyTheme(resolveTheme(choice));
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(resolveTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice, active]);

  useEffect(() => () => applyTheme(null), []);

  if (!active) return null;

  const pick = (value: ThemeChoice) => {
    setChoice(value);
    writeThemeChoice(userId, value);
  };

  return (
    <div className="admin-theme-toggle" role="group" aria-label="Color theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => pick(value)}
          aria-pressed={choice === value}
          title={`${label} theme`}
          className={`admin-theme-toggle__btn ${choice === value ? "is-active" : ""}`}
        >
          <Icon className="h-3 w-3" />
          <span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
