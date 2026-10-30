export interface CatalogAddon {
  addon_key: string; display_name: string; display_name_es: string | null;
  description_en: string | null; description_es: string | null;
  price_cents: number; services: string[]; gift_eligible: boolean;
  estate_bundle_only: boolean; size_prices: unknown; added_minutes: unknown;
  pro_pay_pct: number; lookup_key: string | null;
}
const numberAt = (value: unknown, size: number) => {
  if (!value || typeof value !== 'object') return null;
  const n = Number((value as Record<string, unknown>)[String(size)]);
  return Number.isFinite(n) && n > 0 ? n : null;
};
export function addonQuote(addon: CatalogAddon, size: number | null, quarterly = false) {
  if (addon.estate_bundle_only && size !== null && size >= 4) return null;
  if (addon.addon_key === 'deep_clean' && (quarterly || !size || size > 5)) return null;
  const cents = addon.addon_key === 'deep_clean' ? numberAt(addon.size_prices, size ?? 0) : addon.price_cents;
  if (!cents) return null;
  return { cents, payCents: Math.round(cents * addon.pro_pay_pct / 100), minutes: numberAt(addon.added_minutes, size ?? 0) ?? 0 };
}
export function reviewComplete(groups: string[], checked: Record<string, boolean | undefined>, terms: boolean) {
  return terms && groups.length > 0 && groups.every(g => checked[g] === true);
}
export function reviewUnlock(scrolledBottom: boolean, fits: boolean, visibleMilliseconds: number) {
  return scrolledBottom || (fits && visibleMilliseconds >= 6000);
}