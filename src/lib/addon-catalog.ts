// Tidy — Add-on catalog (client mirror of public.addon_catalog live rows).
// Fourteen live add-ons; the nine at $55 or under are gift-eligible. Stripe is referenced by
// lookup_key only. Retired add-ons stay switched off in the database records.

export type AddonService = 'cleaning' | 'lawn' | 'detailing';

export type Addon = {
  key: string;
  name: string;
  price: number;
  service: AddonService;
  /** Stable Stripe lookup_key. */
  lookupKey: string;
  /** Lucide icon name */
  icon: string;
  /** Items that "feel one-time" — pushed to bottom if bought in last 60 days */
  oneTimeFeel?: boolean;
  /** May be picked as the free monthly bundle add-on ($55 and under). */
  giftEligible: boolean;
};

export const ADDON_CATALOG: Addon[] = [
  // Cleaning
  { key: 'inside_oven_clean',   name: 'Inside Oven Clean',   price: 45, service: 'cleaning', lookupKey: 'addon_inside_oven',      icon: 'Flame',        giftEligible: true },
  { key: 'inside_fridge_clean', name: 'Inside Fridge Clean', price: 35, service: 'cleaning', lookupKey: 'addon_inside_fridge',    icon: 'Refrigerator', giftEligible: true },
  { key: 'interior_windows',    name: 'Interior Windows',    price: 55, service: 'cleaning', lookupKey: 'addon_interior_windows', icon: 'PanelTop',     giftEligible: true },
  { key: 'deep_baseboard_scrub',    name: 'Deep Baseboard Scrub',    price: 35, service: 'cleaning', lookupKey: 'addon_deep_baseboard',   icon: 'Ruler',    giftEligible: true },
  { key: 'inside_kitchen_cabinets', name: 'Inside Kitchen Cabinets', price: 50, service: 'cleaning', lookupKey: 'addon_kitchen_cabinets', icon: 'Archive',  giftEligible: true },
  // Lawn
  { key: 'weed_removal',        name: 'Weed Removal — Garden Beds', price: 45, service: 'lawn', lookupKey: 'addon_weed_removal',  icon: 'Sprout',   giftEligible: true },
  { key: 'leaf_debris_cleanup', name: 'Leaf & Debris Cleanup',      price: 55, service: 'lawn', lookupKey: 'addon_leaf_debris',   icon: 'Leaf',     giftEligible: true },
  { key: 'bed_edge_reset',      name: 'Bed Edge Reset',             price: 65, service: 'lawn', lookupKey: 'addon_bed_edge_reset', icon: 'Scissors', giftEligible: false },
  { key: 'exterior_windows_screens', name: 'Exterior Windows & Screens', price: 85, service: 'lawn', lookupKey: 'addon_exterior_windows_screens', icon: 'AppWindow', giftEligible: false },
  { key: 'driveway_pressure_wash',   name: 'Driveway Pressure Wash',     price: 150, service: 'lawn', lookupKey: 'addon_driveway_pressure_wash', icon: 'Droplets', oneTimeFeel: true, giftEligible: false },
  // Car care
  { key: 'pet_hair_removal',           name: 'Pet Hair Removal',             price: 45, service: 'detailing', lookupKey: 'addon_pet_hair',               icon: 'Dog',         giftEligible: true },
  { key: 'interior_protect_condition', name: 'Interior Protect & Condition', price: 55, service: 'detailing', lookupKey: 'addon_interior_protect',       icon: 'ShieldCheck', giftEligible: true },
  { key: 'headlight_restoration',      name: 'Headlight Restoration',        price: 79, service: 'detailing', lookupKey: 'addon_headlight_restoration', icon: 'Lightbulb', oneTimeFeel: true, giftEligible: false },
  { key: 'clay_bar_ceramic_coat',      name: 'Clay Bar & Ceramic Coat',      price: 95, service: 'detailing', lookupKey: 'addon_clay_bar_ceramic_coat', icon: 'Sparkles', oneTimeFeel: true, giftEligible: false },
];

/** The pool the free monthly add-on for bundled plans is picked from. */
export const GIFT_ELIGIBLE_ADDONS = ADDON_CATALOG.filter((a) => a.giftEligible);

export const SERVICE_LABELS: Record<AddonService, string> = {
  cleaning: 'Cleaning',
  lawn: 'Lawn',
  detailing: 'Detailing',
};

export function addonsForServices(services: AddonService[]): Record<AddonService, Addon[]> {
  const map = {} as Record<AddonService, Addon[]>;
  for (const s of services) {
    map[s] = ADDON_CATALOG.filter(a => a.service === s);
  }
  return map;
}
