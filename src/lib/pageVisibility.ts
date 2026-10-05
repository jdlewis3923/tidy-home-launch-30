/**
 * Per-page visibility. Each public page has its own on/off switch; a page set ON
 * stays reachable even while the master site switch is OFF.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const TOGGLEABLE_PAGES = [
  { path: "/", label: "Home" },
  { path: "/founding", label: "Founding (door hangers)" },
  { path: "/refer", label: "Refer" },
  { path: "/bundle", label: "Bundle" },
  { path: "/house-cleaning", label: "House Cleaning" },
  { path: "/lawn-care", label: "Lawn Care" },
  { path: "/car-care", label: "Car Care (/car-detailing)" },
  { path: "/apply", label: "Apply (Pros)" },
  { path: "/terms", label: "Terms" },
  { path: "/privacy", label: "Privacy" },
] as const;

/** Pages /founding links to. If one is unreachable while /founding is on, the hanger ships a dead link. */
export const FOUNDING_DEPENDENCIES = ["/terms", "/privacy", "/refer"] as const;

/** Map a browser path to its toggle key (null = not individually toggleable). */
export function pageKeyFor(pathname: string): string | null {
  if (pathname === "/" || pathname === "") return "/";
  if (pathname.startsWith("/car-detailing") || pathname.startsWith("/car-care")) return "/car-care";
  const hit = TOGGLEABLE_PAGES.find((p) => p.path !== "/" && (pathname === p.path || pathname.startsWith(`${p.path}/`)));
  return hit ? hit.path : null;
}

export async function readPageVisibility(): Promise<Record<string, boolean>> {
  const { data, error } = await supabase.rpc("get_page_visibility" as never);
  if (error) throw error;
  return (data ?? {}) as Record<string, boolean>;
}

export function usePageVisibility() {
  return useQuery({ queryKey: ["page-visibility"], queryFn: readPageVisibility, staleTime: 60_000, retry: 1 });
}

/**
 * Is this page reachable for the public? Master ON → everything; otherwise the
 * page's own switch. /founding fails OPEN when the switch can't be read, because
 * 15,000 printed hangers point at it; every other page fails closed.
 */
export function pageAllowed(pathname: string, masterLive: boolean, vis: Record<string, boolean> | undefined, visError: boolean): boolean {
  const key = pageKeyFor(pathname);
  if (key === "/founding" && vis && vis[key] === false) return false;
  if (masterLive) return true;
  if (!key) return false;
  if (key === "/founding") return visError || !vis ? true : vis[key] !== false;
  return !!vis?.[key];
}
