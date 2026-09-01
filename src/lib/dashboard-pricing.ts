import {
  CADENCE_MULTIPLIER,
  CAR_WASH_LOOKUP_KEYS,
  CAR_WASH_PRICES,
  ENTRY_PRICE_MONTHLY,
  REFERRAL_BONUS_CENTS,
  SERVICE_LOOKUP_KEYS,
  SERVICE_NAMES,
  SERVICE_QUANTITY_RULE,
  SERVICE_UNIT,
  SIZE_HELPERS,
  SIZE_LABELS,
  SIZE_PRICES,
  SIZES,
  VEHICLE_CLASS_LABELS,
  VEHICLE_CLASS_SIZE,
  freeAddonsPerMonth,
  quantityFor,
  sizeFromBedrooms,
  type CanonService,
  type CanonSize,
  type SizeSelection,
  type VehicleClass,
  type WashCount,
} from '@/lib/pricing-canon';
import { FLORIDA_TAX, cartTriggersFloridaTax, FL_SALES_TAX_COLLECTION_ENABLED } from '@/lib/florida-tax';

// Referral reward — give $50, get $50.
export const REFERRAL_DISCOUNT_CENTS = REFERRAL_BONUS_CENTS;

// Types
export type ServiceType = CanonService;
export type Frequency = 'monthly' | 'biweekly' | 'weekly';
export type Size = CanonSize;
export type { SizeSelection, VehicleClass, WashCount };

/** Plain-language lawn answers. We never ask for turf area at checkout. */
export type LawnChoice = 'small' | 'standard' | 'large' | 'over';

export interface ConfigState {
  services: ServiceType[];
  frequencies: Partial<Record<ServiceType, Frequency>>;
  /** Cleaning size, derived from bedrooms (+1 size when baths exceed the limit). */
  bedrooms: string | null;
  bathrooms: string | null;
  /** Lawn size, picked by eye — we confirm from aerial imagery before visit one. */
  lawnChoice: LawnChoice | null;
  /** Car care size, derived from what they drive. */
  vehicleClass: VehicleClass | null;
  /** Optional Car Wash Add-On (per month). Requires lawn or cleaning. */
  carWashes: WashCount | null;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  address: string;
  city: string;
  zip: string;
  accessNotes: string;
  preferredDay: string;
  preferredTime: string;
  referralCode: string;
  addOns: string[];
  smsConsent: boolean;
  outOfCoverage: boolean;
  /** Car step: wash and detail are mutually exclusive. */
  carVariant: 'car_wash' | 'car_detail' | null;
  /** Water/access gate — null = not yet answered. */
  hasWaterSpigot: boolean | null;
  hasElectricalOutlet: boolean | null;
  washingAllowed: boolean | null;
}

export const defaultState: ConfigState = {
  services: [],
  frequencies: {},
  bedrooms: null,
  bathrooms: null,
  lawnChoice: null,
  vehicleClass: null,
  carWashes: null,
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  address: '',
  city: '',
  zip: '',
  accessNotes: '',
  preferredDay: '',
  preferredTime: '',
  referralCode: '',
  addOns: [],
  smsConsent: false,
  outOfCoverage: false,
  carVariant: null,
  hasWaterSpigot: null,
  hasElectricalOutlet: null,
  washingAllowed: null,
};

// ---------------------------------------------------------------------------
// Sizes — labels and derivation from the plain answers we do ask for.
// ---------------------------------------------------------------------------

export const sizeLabels = SIZE_LABELS;
export const sizeHelpers = SIZE_HELPERS;
export const vehicleClassLabels = VEHICLE_CLASS_LABELS;
export const allSizes = SIZES;

export const lawnChoiceLabels: Record<LawnChoice, string> = {
  small: 'Small yard',
  standard: 'Standard yard',
  large: 'Large yard',
  over: 'Bigger than that',
};

export const lawnChoiceHelpers: Record<LawnChoice, string> = {
  small: 'up to 3,000 sq ft of turf',
  standard: '3,001–6,000 sq ft of turf',
  large: '6,001–10,000 sq ft of turf',
  over: 'more than 10,000 sq ft — we quote it',
};

export function bathroomsToNumber(value: string | null): number {
  if (!value) return 0;
  return parseFloat(value.replace('+', ''));
}

export function bedroomsToNumber(value: string | null): number {
  if (!value) return 0;
  return parseInt(value.replace('+', ''), 10);
}

/** Cleaning size from bedrooms and bathrooms. */
export function sizeForCleaning(bedrooms: string | null, bathrooms: string | null): SizeSelection | null {
  const beds = bedroomsToNumber(bedrooms);
  const baths = bathroomsToNumber(bathrooms);
  if (!beds || !baths) return null;
  return sizeFromBedrooms(beds, baths);
}

/** Lawn size from the by-eye answer. */
export function sizeForLawn(choice: LawnChoice | null): SizeSelection | null {
  if (!choice) return null;
  if (choice === 'over') return 'quote';
  return choice === 'small' ? 1 : choice === 'standard' ? 2 : 3;
}

/** Car care size from what they drive. */
export function sizeForCarCare(vehicleClass: VehicleClass | null): SizeSelection | null {
  if (!vehicleClass) return null;
  return VEHICLE_CLASS_SIZE[vehicleClass];
}

/** The size in play for a service, given the current answers. */
export function sizeFor(state: ConfigState, service: ServiceType): SizeSelection | null {
  if (service === 'cleaning') return sizeForCleaning(state.bedrooms, state.bathrooms);
  if (service === 'lawn') return sizeForLawn(state.lawnChoice);
  return sizeForCarCare(state.vehicleClass);
}

/** True when any selected service is above size 3 — quote by hand, never book. */
export function needsQuote(state: ConfigState): boolean {
  return state.services.some((svc) => sizeFor(state, svc) === 'quote');
}

/** Kept for older call sites: a quote-sized plan is not purchasable. */
export const hasCustomQuote = needsQuote;

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export const serviceUnits = SERVICE_UNIT;
export const serviceQuantityRules = SERVICE_QUANTITY_RULE;
export const serviceLookupKeys = SERVICE_LOOKUP_KEYS;
export const carWashLookupKeys = CAR_WASH_LOOKUP_KEYS;

/** Sticker price for a size: per visit for cleaning/lawn, per month for car care. */
export function getSizePrice(service: ServiceType, size: Size): number {
  return SIZE_PRICES[service][size];
}

/** Visits billed per month at a cadence. */
export function visitsPerMonth(frequency: Frequency): number {
  return CADENCE_MULTIPLIER[frequency];
}

/** Monthly billed amount for one service line. */
export function getServicePrice(state: ConfigState, service: ServiceType): number {
  const size = sizeFor(state, service);
  if (!size || size === 'quote') return 0;
  const freq = state.frequencies[service] ?? 'monthly';
  if (SERVICE_QUANTITY_RULE[service] === 'always_1') return getSizePrice(service, size);
  return getSizePrice(service, size) * visitsPerMonth(freq);
}

/** The Car Wash Add-On price per month, if selected. */
export function getCarWashPrice(state: ConfigState): number {
  if (!state.carWashes) return 0;
  const size = sizeForCarCare(state.vehicleClass);
  if (!size || size === 'quote') return 0;
  return CAR_WASH_PRICES[size][state.carWashes];
}

/** The Car Wash Add-On requires an active lawn or cleaning plan. */
export function carWashEligible(state: ConfigState): boolean {
  return state.services.includes('lawn') || state.services.includes('cleaning');
}

/** True whenever a car-care selection (wash or detail) makes sense to show. */
export function carVariantAvailable(state: ConfigState): boolean {
  return carWashEligible(state) || state.services.includes('detailing');
}

/**
 * Sets the mutually-exclusive car variant. Selecting car_detail always wins:
 * it adds the 'detailing' service and clears any Car Wash Add-On. Selecting
 * car_wash removes 'detailing' and turns the Car Wash Add-On on.
 */
export function setCarVariant(state: ConfigState, variant: 'car_wash' | 'car_detail'): ConfigState {
  if (variant === 'car_detail') {
    const services = state.services.includes('detailing') ? state.services : [...state.services, 'detailing'];
    const frequencies = { ...state.frequencies, detailing: state.frequencies.detailing ?? 'monthly' as Frequency };
    return { ...state, carVariant: 'car_detail', services, frequencies, carWashes: null };
  }
  const services = state.services.filter((s) => s !== 'detailing');
  const frequencies = { ...state.frequencies };
  delete frequencies.detailing;
  return { ...state, carVariant: 'car_wash', services, frequencies, carWashes: state.carWashes ?? 1 };
}

/** True once the customer has a live car service (wash or detail) selected. */
export function hasCarService(state: ConfigState): boolean {
  return state.services.includes('detailing') || !!state.carWashes;
}

/**
 * Free premium add-ons each month, earned by bundling. Never a percentage, and
 * never a car wash — the customer picks one add-on from the gift pool.
 */
export function freeAddons(state: ConfigState): number {
  return freeAddonsPerMonth(state.services.length);
}

// One-time add-ons. Size covers the property — add-ons are extra tasks only.
export const addOnData: Record<string, { name: string; price: number; service: ServiceType; description: string; specialist?: boolean }> = {
  // House Cleaning
  oven: { name: 'Inside Oven Clean', price: 45, service: 'cleaning', description: 'Deep clean inside your oven' },
  fridge: { name: 'Inside Fridge Clean', price: 35, service: 'cleaning', description: 'Interior fridge scrub & wipe-down' },
  interiorWindows: { name: 'Interior Windows', price: 55, service: 'cleaning', description: 'All interior glass cleaned' },
  baseboards: { name: 'Deep Baseboard Scrub', price: 35, service: 'cleaning', description: 'Hand-detailed baseboards' },
  laundry: { name: 'Laundry — Wash, Dry & Fold (1 load)', price: 30, service: 'cleaning', description: 'One load, washed, dried, and folded' },
  cabinets: { name: 'Inside Kitchen Cabinets', price: 50, service: 'cleaning', description: 'Wipe inside all kitchen cabinets' },

  // Lawn Care
  weed: { name: 'Weed Removal — Garden Beds', price: 45, service: 'lawn', description: 'Manual weed pulling in beds' },
  leaf: { name: 'Leaf & Debris Cleanup', price: 55, service: 'lawn', description: 'Full yard leaf and debris removal' },
  bedEdgeReset: { name: 'Bed Edge Reset', price: 65, service: 'lawn', description: 'Clean vertical edge cut where beds meet turf — mulch stays in, grass stays out' },
  exteriorWindows: { name: 'Exterior Windows & Screens', price: 85, service: 'lawn', description: 'Exterior window and screen rinse — ground floor only, no ladder work' },
  pressureWash: { name: 'Driveway Pressure Wash', price: 150, service: 'lawn', description: 'Concrete driveway and walkway pressure clean', specialist: true },


  // Car care — condition surcharges live here, never in a size.
  petHair: { name: 'Pet Hair Removal', price: 45, service: 'detailing', description: 'Thorough pet hair extraction' },
  clayBarCeramic: { name: 'Clay Bar & Ceramic Coat', price: 95, service: 'detailing', description: 'Clay bar paint decontamination then a ceramic spray coat — about 6 months of protection' },
  headlightRestoration: { name: 'Headlight Restoration', price: 79, service: 'detailing', description: 'Wet-sand, polish and UV-seal both headlights back to clear — the UV sealant keeps them from re-yellowing' },
  interiorProtect: { name: 'Interior Protect & Condition', price: 55, service: 'detailing', description: 'Dash, door panels and seats cleaned and conditioned with UV protection' },
};

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Lowest price a service can start at (its size 1). */
export function getServiceStartingPrice(service: ServiceType): number {
  return SIZE_PRICES[service][1];
}

/** The single company-wide entry price, as a monthly figure. */
export function getEntryPriceMonthly(): number {
  return ENTRY_PRICE_MONTHLY;
}

export const defaultBundleFrequency: Record<ServiceType, Frequency> = {
  cleaning: 'biweekly',
  lawn: 'biweekly',
  detailing: 'monthly',
};

export function formatPerVisit(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)} a visit`;
}

export function formatMonthly(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}/mo`;
}

/** How a service's sticker price reads on its own. */
export function formatSizePrice(service: ServiceType, size: Size): string {
  const price = getSizePrice(service, size);
  return SERVICE_UNIT[service] === 'per_month' ? formatMonthly(price) : formatPerVisit(price);
}

export function calculatePricing(state: ConfigState) {
  const servicePrices = state.services.map((s) => {
    const size = sizeFor(state, s);
    return {
      service: s,
      size,
      unit: SERVICE_UNIT[s],
      sticker: size && size !== 'quote' ? getSizePrice(s, size) : 0,
      quantity: size && size !== 'quote' ? quantityFor(s, state.frequencies[s] ?? 'monthly') : 0,
      price: getServicePrice(state, s),
    };
  });

  const servicesSubtotal = servicePrices.reduce((sum, sp) => sum + sp.price, 0);
  const carWashSubtotal = getCarWashPrice(state);

  const addOnsSubtotal = state.addOns.reduce((sum, id) => {
    const addon = addOnData[id];
    return addon ? sum + addon.price : sum;
  }, 0);

  // No percentage discounts exist. Bundling earns one free premium add-on a month.
  const subtotal = servicesSubtotal + carWashSubtotal + addOnsSubtotal;
  const netTotal = subtotal;

  // Florida sales tax stays gated off (see src/lib/florida-tax.ts).
  const taxTriggered =
    FL_SALES_TAX_COLLECTION_ENABLED &&
    cartTriggersFloridaTax((state.addOns ?? []).map((addon_name) => ({ addon_name })));
  const taxPercent = taxTriggered ? FLORIDA_TAX.percentage / 100 : 0;
  const taxAmount = Math.round(netTotal * taxPercent * 100) / 100;
  const total = netTotal + taxAmount;

  return {
    servicePrices,
    subtotal,
    servicesSubtotal,
    carWashSubtotal,
    addOnsSubtotal,
    freeAddons: freeAddons(state),
    servicesTotal: servicesSubtotal,
    addOnsTotal: addOnsSubtotal,
    /** Pre-tax amount. */
    netTotal,
    taxTriggered,
    taxPercentage: taxTriggered ? FLORIDA_TAX.percentage : 0,
    taxAmount,
    firstMonth: total,
    ongoing: total,
  };
}

export const VALID_ZIPS = ['33183', '33186', '33156'];

export const frequencyLabels: Record<Frequency, string> = {
  monthly: 'Monthly',
  biweekly: 'Biweekly',
  weekly: 'Weekly',
};

export const frequencyVisitCopy: Record<Frequency, string> = {
  monthly: '1 visit a month',
  biweekly: '2 visits a month',
  weekly: '4 visits a month',
};

export const serviceLabels: Record<ServiceType, string> = SERVICE_NAMES;

export const serviceIcons: Record<ServiceType, string> = {
  cleaning: '🏠',
  lawn: '🌿',
  detailing: '🚗',
};

// localStorage helpers
const STORAGE_KEY = 'tidy_config';

const LEGACY_FIELDS = ['homeSize', 'yardSize', 'vehicleSize', 'homeBand', 'lawnBand', 'vehicleBand', 'lotChoice', 'cornerLot', 'vehicleCount'];

export function loadState(): ConfigState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // SECURITY: never restore sensitive plaintext from localStorage.
      if (parsed.password != null || parsed.address != null || parsed.accessNotes != null) {
        const cleaned = { ...parsed };
        delete cleaned.password;
        delete cleaned.address;
        delete cleaned.accessNotes;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      }
      // Legacy carts stored retired size tiers and four-band fields. They don't
      // translate to the 1/2/3 sizes, so drop them and re-ask.
      for (const field of LEGACY_FIELDS) delete parsed[field];
      return { ...defaultState, ...parsed, password: '', address: '', accessNotes: '' };
    }
  } catch {}
  return { ...defaultState };
}

export function saveState(state: ConfigState) {
  const safe = { ...state };
  delete (safe as Partial<ConfigState>).password;
  delete (safe as Partial<ConfigState>).address;
  delete (safe as Partial<ConfigState>).accessNotes;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
