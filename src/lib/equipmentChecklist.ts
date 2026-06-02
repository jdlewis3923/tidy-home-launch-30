// Tidy — Equipment checklist per service (Phase 3 onboarding).
// Multi-service applicants upload the UNION of required items.

export type EquipmentItem = {
  key: string;
  label: string;
  description: string;
};

export const HOUSE_CLEANING_ITEMS: EquipmentItem[] = [
  { key: 'vacuum_cleaner', label: 'Vacuum cleaner',
    description: 'Working upright, canister, or commercial vacuum. Handheld-only not accepted.' },
  { key: 'mop_and_bucket', label: 'Mop and bucket',
    description: 'Show both together. String, flat, or microfiber spin mop accepted.' },
  { key: 'supply_kit', label: 'Supply caddy / kit',
    description: 'Must include: all-purpose cleaner, glass cleaner, bathroom cleaner, disinfectant wipes, 5+ microfiber cloths, gloves, scrub brush, sponges, toilet brush.' },
  { key: 'uniform_or_attire', label: 'Uniform / job attire',
    description: 'Clean professional attire with closed-toe shoes. Tidy shirt optional at Tier 1.' },
];

export const LAWN_ITEMS: EquipmentItem[] = [
  { key: 'mower', label: 'Mower',
    description: 'Gas or battery push / self-propelled in operable condition. Reel mowers not accepted.' },
  { key: 'edger', label: 'Edger', description: 'Stick or wheeled edger.' },
  { key: 'blower', label: 'Blower',
    description: 'Backpack or handheld gas/battery blower. Corded electric not accepted.' },
  { key: 'trimmer', label: 'String trimmer',
    description: 'Gas or battery powered weed eater.' },
  { key: 'vehicle_and_trailer', label: 'Vehicle + trailer/rack',
    description: 'Truck, van, or vehicle with trailer or rack able to transport all 4 pieces.' },
];

export const DETAIL_ITEMS: EquipmentItem[] = [
  { key: 'pressure_washer_or_water_source', label: 'Pressure washer or water source',
    description: 'Portable pressure washer OR a photo showing planned jobsite hose-access approach.' },
  { key: 'shop_vac_or_wet_dry_vac', label: 'Wet/dry vac',
    description: 'Must be wet/dry capable — regular vacuums not accepted.' },
  { key: 'polishing_supplies', label: 'Polishing supplies',
    description: 'Dual-action polisher OR rotary buffer plus pads. Hand-application OK at Tier 1 with note.' },
  { key: 'microfiber_supply', label: 'Microfiber supply',
    description: '10+ microfiber cloths in multiple colors (wash, dry, polish, glass).' },
  { key: 'vehicle', label: 'Vehicle',
    description: 'Truck, van, or vehicle large enough to transport all gear and provide power if needed.' },
];

const BY_SERVICE: Record<string, EquipmentItem[]> = {
  cleaning: HOUSE_CLEANING_ITEMS,
  house_cleaning: HOUSE_CLEANING_ITEMS,
  lawn: LAWN_ITEMS,
  lawn_care: LAWN_ITEMS,
  detail: DETAIL_ITEMS,
  detailing: DETAIL_ITEMS,
  car: DETAIL_ITEMS,
  car_detailing: DETAIL_ITEMS,
};

/** Normalize free-form service string(s) → distinct required items (UNION). */
export function getRequiredItems(service: string | null | undefined): EquipmentItem[] {
  const raw = (service ?? '').toLowerCase();
  if (!raw) return [];
  const tokens = raw.split(/[,;/|+&\s]+/).filter(Boolean);
  if (raw.includes('bundle') || raw.includes('all')) {
    tokens.push('cleaning', 'lawn', 'detail');
  }
  const seen = new Set<string>();
  const items: EquipmentItem[] = [];
  for (const t of tokens) {
    let list: EquipmentItem[] | null = null;
    if (t.includes('clean')) list = HOUSE_CLEANING_ITEMS;
    else if (t.includes('lawn')) list = LAWN_ITEMS;
    else if (t.includes('detail') || t.includes('car')) list = DETAIL_ITEMS;
    else list = BY_SERVICE[t] ?? null;
    if (!list) continue;
    for (const it of list) {
      if (!seen.has(it.key)) { seen.add(it.key); items.push(it); }
    }
  }
  // Fallback: assume cleaning if we couldn't parse anything.
  if (items.length === 0) return HOUSE_CLEANING_ITEMS;
  return items;
}

export const REJECTION_REASONS = [
  'Image too blurry',
  'Wrong item shown',
  'Item appears damaged or non-functional',
  'Insufficient items shown (need to see more)',
  'Other (see note)',
] as const;
