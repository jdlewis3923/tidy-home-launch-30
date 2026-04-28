// Tidy — Add-on catalog for "Add to your next visit" panel.
// Mirrors the spec; stripe_price_id should be set after running setup-stripe-catalog.
// For now we use the catalog identifiers and look up Stripe price ids server-side.

export type AddonService = 'cleaning' | 'lawn' | 'detailing';

export type Addon = {
  key: string;
  name: string;
  price: number;
  service: AddonService;
  /** Lucide icon name */
  icon: string;
  /** Items that "feel one-time" — pushed to bottom if bought in last 60 days */
  oneTimeFeel?: boolean;
};

export const ADDON_CATALOG: Addon[] = [
  // Cleaning
  { key: 'inside_oven',        name: 'Inside Oven Clean',     price: 45, service: 'cleaning', icon: 'Flame' },
  { key: 'inside_fridge',      name: 'Inside Fridge Clean',   price: 35, service: 'cleaning', icon: 'Refrigerator' },
  { key: 'interior_windows',   name: 'Interior Windows',      price: 55, service: 'cleaning', icon: 'PanelTop' },
  { key: 'baseboard_scrub',    name: 'Deep Baseboard Scrub',  price: 35, service: 'cleaning', icon: 'Brush' },
  { key: 'laundry_wdf',        name: 'Laundry W/D/F',         price: 30, service: 'cleaning', icon: 'Shirt' },
  { key: 'inside_cabinets',    name: 'Inside Kitchen Cabinets', price: 50, service: 'cleaning', icon: 'Boxes' },
  // Lawn
  { key: 'hedge_trim',         name: 'Hedge & Bush Trimming', price: 65, service: 'lawn', icon: 'Scissors' },
  { key: 'weed_removal',       name: 'Weed Removal',          price: 45, service: 'lawn', icon: 'Sprout' },
  { key: 'leaf_cleanup',       name: 'Leaf & Debris Cleanup', price: 55, service: 'lawn', icon: 'Leaf' },
  { key: 'fertilization',      name: 'Fertilization Treatment', price: 75, service: 'lawn', icon: 'Droplets', oneTimeFeel: true },
  { key: 'driveway_pressure',  name: 'Driveway Pressure Wash', price: 150, service: 'lawn', icon: 'Wind', oneTimeFeel: true },
  // Detail
  { key: 'ozone_odor',         name: 'Ozone Odor Treatment',  price: 75, service: 'detailing', icon: 'Wind' },
  { key: 'pet_hair',           name: 'Pet Hair Removal',      price: 45, service: 'detailing', icon: 'Dog' },
  { key: 'engine_bay',         name: 'Engine Bay Clean',      price: 85, service: 'detailing', icon: 'Wrench' },
  { key: 'ceramic_spray',      name: 'Ceramic Spray Coat',    price: 85, service: 'detailing', icon: 'Sparkles', oneTimeFeel: true },
];

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
