/**
 * Tidy — the small set of icons add-ons can use.
 *
 * Add-on icon names arrive as strings (catalogue file or addon_catalog row), so
 * the dashboard used to reach into the whole icon library with a wildcard
 * import. That pulled ~700 KB of unused icons into the customer bundle. This
 * map lists only the icons add-ons actually use, so the bundler can drop the
 * rest. Add a name here when a new add-on needs a new icon.
 */
import {
  Archive,
  Boxes,
  Brush,
  Bug,
  Dog,
  Droplets,
  Flame,
  Leaf,
  Lightbulb,
  Minus,
  PanelTop,
  PawPrint,
  RectangleVertical,
  Refrigerator,
  Scissors,
  Settings,
  Shield,
  ShieldCheck,
  Shirt,
  Snowflake,
  Sparkles,
  SprayCan,
  Sprout,
  Wind,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Archive,
  Boxes,
  Brush,
  Bug,
  Dog,
  Droplets,
  Flame,
  Leaf,
  Lightbulb,
  Minus,
  PanelTop,
  PawPrint,
  RectangleVertical,
  Refrigerator,
  Scissors,
  Settings,
  Shield,
  ShieldCheck,
  Shirt,
  Snowflake,
  Sparkles,
  SprayCan,
  Sprout,
  Wind,
};

/** Icon names from the database are kebab-case; component names are PascalCase. */
function pascalize(name: string): string {
  return name
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : ""))
    .join("");
}

/** Resolve an add-on icon name, falling back to the sparkle. */
export function addonIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Sparkles;
  return ICONS[pascalize(name)] ?? Sparkles;
}
