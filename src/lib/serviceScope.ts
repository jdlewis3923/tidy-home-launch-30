// Service scope — read-only client for public.service_scope (the one source of
// truth). This file holds NO scope text; it only fetches and groups rows.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ScopeService = "cleaning" | "cleaning_deep_clean" | "lawn" | "car_wash" | "car_detail";
export type ScopeSection = "included" | "not_included" | "add_on" | "customer_must" | "notice";
/** One checkbox per bought service. */
export type ScopeGroup = "cleaning" | "lawn" | "car_care" | "car_wash_addon";

export interface ScopeRow {
  id: string;
  service: ScopeService;
  section: ScopeSection;
  text_en: string;
  text_es: string;
  group_en: string | null;
  group_es: string | null;
  notice_key: string | null;
  addon_key: string | null;
  sort_order: number;
  scope_version: number;
  active: boolean;
  updated_at?: string;
}

export const GROUP_SCOPES: Record<ScopeGroup, ScopeService[]> = {
  cleaning: ["cleaning", "cleaning_deep_clean"],
  lawn: ["lawn"],
  car_care: ["car_wash", "car_detail"],
  car_wash_addon: ["car_wash"],
};
export const isCarGroup = (g: ScopeGroup) => g === "car_care" || g === "car_wash_addon";

export const GROUP_NAME: Record<ScopeGroup, [string, string]> = {
  cleaning: ["House Cleaning", "Limpieza del hogar"],
  lawn: ["Lawn Care", "Cuidado del césped"],
  car_care: ["Car Care", "Cuidado del Auto"],
  car_wash_addon: ["the Car Wash Add-On", "el lavado de auto adicional"],
};
export const SCOPE_TITLE: Record<ScopeService, [string, string]> = {
  cleaning: ["Standard visit", "Visita estándar"],
  cleaning_deep_clean: ["Quarterly deep clean", "Limpieza profunda trimestral"],
  lawn: ["Every visit", "Cada visita"],
  car_wash: ["Maintenance wash — exterior wash plus interior clean (not a detail)", "Lavado de mantenimiento — lavado exterior más limpieza interior (no es un detallado)"],
  car_detail: ["Full detail — twice a year", "Detallado completo — dos veces al año"],
};

/** Plan service keys (cleaning | lawn | detailing) + car wash add-on → groups. */
export function groupsFor(services: string[], carWashAddon = false): ScopeGroup[] {
  const out = new Set<ScopeGroup>();
  for (const s of services) {
    if (s === "cleaning") out.add("cleaning");
    else if (s === "lawn") out.add("lawn");
    else if (s === "detailing") out.add("car_care");
  }
  if (carWashAddon && !out.has("car_care")) out.add("car_wash_addon");
  return [...out];
}

export function visitScopes(serviceType: string | null | undefined, visitKind: string | null | undefined): ScopeService[] {
  if (serviceType === "cleaning") return visitKind === "deep_clean" ? ["cleaning", "cleaning_deep_clean"] : ["cleaning"];
  if (serviceType === "lawn") return ["lawn"];
  if (serviceType === "detailing" || visitKind === "car_wash") return visitKind === "full_detail" ? ["car_wash", "car_detail"] : ["car_wash"];
  return [];
}

/** Active scope rows (current version) for everything. Cached. */
export function useServiceScope() {
  return useQuery({
    queryKey: ["service_scope", "active"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_scope")
        .select("id, service, section, text_en, text_es, group_en, group_es, notice_key, addon_key, sort_order, scope_version, active, updated_at")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ScopeRow[];
    },
  });
}

/** Rows at a specific version per service (members held to an older accepted version). */
export function useScopeAtVersions(versions: Partial<Record<ScopeService, number>> | null) {
  return useQuery({
    queryKey: ["service_scope", "versions", versions],
    enabled: !!versions,
    queryFn: async () => {
      const out: ScopeRow[] = [];
      for (const [svc, v] of Object.entries(versions ?? {})) {
        const { data } = await supabase
          .from("service_scope")
          .select("id, service, section, text_en, text_es, group_en, group_es, notice_key, addon_key, sort_order, scope_version, active")
          .eq("service", svc).eq("scope_version", v as number).order("sort_order");
        out.push(...((data ?? []) as ScopeRow[]));
      }
      return out;
    },
  });
}

export const txt = (r: { text_en: string; text_es: string }, lang: string) => (lang === "es" ? r.text_es : r.text_en);
export const grp = (r: ScopeRow, lang: string) => (lang === "es" ? r.group_es : r.group_en);

/** Records acceptances (one call per submit). Returns the ref to send with reserve/pay. */
export async function recordScopeAcceptance(opts: {
  groups: ScopeGroup[];
  email?: string;
  language: "en" | "es";
  surface: "founding" | "quote" | "checkout" | "upgrade";
  checkboxText: Record<string, string>;
}): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const ref = `sa_${crypto.randomUUID()}`;
  const { data, error } = await supabase.functions.invoke("scope-accept", {
    body: {
      ref, email: opts.email || undefined, groups: opts.groups, language: opts.language, surface: opts.surface,
      water_consent: opts.groups.some(isCarGroup) ? true : undefined, checkbox_text: opts.checkboxText,
    },
  });
  if (error || !data?.ok) return { ok: false, error: data?.error ?? error?.message ?? "scope_accept_failed" };
  return { ok: true, ref };
}
