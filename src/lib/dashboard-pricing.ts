import { getBundleDiscountPct } from '@/lib/bundle-discount';
import {
  BAND_PRICES,
  BANDS,
  CADENCE_MULTIPLIER,
  REFERRAL_BONUS_CENTS,
  VEHICLE_CLASS_BAND,
  bandFromBedBath,
  bandPrice,
  type CanonBand,
  type VehicleClass,
} from '@/lib/pricing-canon';
import { FLORIDA_TAX, cartTriggersFloridaTax, FL_SALES_TAX_COLLECTION_ENABLED } from '@/lib/florida-tax';

// Referral reward — give $50, get $50. Unchanged by the band model.
export const REFERRAL_DISCOUNT_CENTS = REFERRAL_BONUS_CENTS;

// Types
export type ServiceType = 'cleaning' | 'lawn' | 'detailing';
export type Frequency = 'monthly' | 'biweekly' | 'weekly';

/**
 * The size band IS the price. One flat per-visit amount per band; cadence
 * multiplies it. `custom` is not a band — it means the property is above
 * Estate and must never be auto-booked.
 */
export type Band = CanonBand;
export type BandSelection = Band | 'custom';

/** Plain-language lot answers. Customers are never asked for square footage. */
export type LotChoice = 'quarter' | 'half' | 'threeQuarter' | 'acre' | 'over' | 'noLot';

export interface ConfigState {
  services: ServiceType[];
  frequencies: Partial<Record<ServiceType, Frequency>>;
  /** Cleaning band, derived from bedrooms + bathrooms. */
  homeBand: BandSelection | null;
  bedrooms: string | null;
  bathrooms: string | null;
  /** Lawn band, derived from the lot answer (+1 band for a corner lot). */
  lawnBand: BandSelection | null;
  lotChoice: LotChoice | null;
  cornerLot: boolean;
  /** Detailing band, derived from the vehicle body type. */
  vehicleBand: BandSelection | null;
  vehicleClass: VehicleClass | null;
  vehicleCount: number;
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
}

export const defaultState: ConfigState = {
  services: [],
  frequencies: {},
  homeBand: null,
  bedrooms: null,
  bathrooms: null,
  lawnBand: null,
  lotChoice: null,
  cornerLot: false,
  vehicleBand: null,
  vehicleClass: null,
  vehicleCount: 1,
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
};

// ---------------------------------------------------------------------------
// Bands — labels, definitions, and derivation from plain-language answers.
// ---------------------------------------------------------------------------

export const bandLabels: Record<Band, string> = {
  compact: 'Compact',
  standard: 'Standard',
  large: 'Large',
  estate: 'Estate',
};

/** What each band means, in the customer's words. */
export const bandCopy: Record<ServiceType, Record<Band, string>> = {
  cleaning: {
    compact: 'up to 2 bed / 2 bath',
    standard: '3 bed / 2 bath',
    large: '4 bed / 3 bath',
    estate: '5+ bed / 4+ bath',
  },
  lawn: {
    compact: 'smaller than a quarter acre',
    standard: 'a quarter to half an acre',
    large: 'half to three-quarters of an acre',
    estate: 'three-quarters to a full acre',
  },
  detailing: {
    compact: 'coupe, sedan or hatchback',
    standard: 'crossover or 2-row SUV',
    large: '3-row SUV, pickup or minivan',
    estate: 'full-size SUV, dually or 8-seat',
  },
};

export const lotChoiceLabels: Record<LotChoice, string> = {
  quarter: 'smaller than a quarter acre',
  half: 'about a quarter to half an acre',
  threeQuarter: 'about half to three-quarters of an acre',
  acre: 'about three-quarters to a full acre',
  over: 'more than an acre',
  noLot: 'no private lot (condo or townhome)',
};

export const vehicleClassLabels: Record<VehicleClass, string> = {
  coupe: 'coupe',
  sedan: 'sedan',
  hatchback: 'hatchback',
  crossover: 'crossover',
  suv2row: '2-row SUV',
  suv3row: '3-row SUV',
  pickup: 'pickup truck',
  minivan: 'minivan',
  suvFullSize: 'full-size SUV',
  dually: 'dually pickup',
  eightSeat: '8-seat vehicle',
};

/** Bathrooms answer → number. Two half baths round up to one full bath. */
export function bathroomsToNumber(value: string | null): number {
  if (!value) return 0;
  return parseFloat(value.replace('+', ''));
}

export function bedroomsToNumber(value: string | null): number {
  if (!value) return 0;
  return parseInt(value.replace('+', ''), 10);
}

/** Cleaning band from the bed/bath answer. */
export function bandForCleaning(bedrooms: string | null, bathrooms: string | null): BandSelection | null {
  const beds = bedroomsToNumber(bedrooms);
  const baths = bathroomsToNumber(bathrooms);
  if (!beds || !baths) return null;
  return bandFromBedBath(beds, baths);
}

/** Lawn band from the lot answer. Corner lots move up one band. */
export function bandForLawn(lot: LotChoice | null, cornerLot: boolean): BandSelection | null {
  if (!lot) return null;
  if (lot === 'over') return 'custom';
  // Condos and townhomes with no private lot are not eligible for lawn.
  if (lot === 'noLot') return null;
  const base: Band = lot === 'quarter' ? 'compact' : lot === 'half' ? 'standard' : lot === 'threeQuarter' ? 'large' : 'estate';
  if (!cornerLot) return base;
  const next = BANDS[BANDS.indexOf(base) + 1];
  return next ?? 'custom';
}

/** Detailing band from the body type. Condition is a surcharge, never a band. */
export function bandForDetailing(vehicleClass: VehicleClass | null): BandSelection | null {
  if (!vehicleClass) return null;
  return VEHICLE_CLASS_BAND[vehicleClass];
}

/** The band in play for a service, given the current answers. */
export function bandFor(state: ConfigState, service: ServiceType): BandSelection | null {
  if (service === 'cleaning') return state.homeBand ?? bandForCleaning(state.bedrooms, state.bathrooms);
  if (service === 'lawn') return state.lawnBand ?? bandForLawn(state.lotChoice, state.cornerLot);
  return state.vehicleBand ?? bandForDetailing(state.vehicleClass);
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

/** Per-visit price for a service at a band. */
export function getPerVisitPrice(service: ServiceType, band: Band): number {
  return bandPrice(service, band);
}

/** Visits billed per month at a cadence. */
export function visitsPerMonth(frequency: Frequency): number {
  return CADENCE_MULTIPLIER[frequency];
}

/** Monthly billed amount for one service line: per-visit price x cadence x qty. */
export function getServicePrice(state: ConfigState, service: ServiceType): number {
  const freq = state.frequencies[service];
  if (!freq) return 0;
  const band = bandFor(state, service);
  if (!band || band === 'custom') return 0;
  const perVisit = getPerVisitPrice(service, band);
  const qty = service === 'detailing' ? Math.max(1, state.vehicleCount) : 1;
  return perVisit * visitsPerMonth(freq) * qty;
}

/** Per-visit price for a service in the current cart (0 when unpriceable). */
export function getServicePerVisit(state: ConfigState, service: ServiceType): number {
  const band = bandFor(state, service);
  if (!band || band === 'custom') return 0;
  const qty = service === 'detailing' ? Math.max(1, state.vehicleCount) : 1;
  return getPerVisitPrice(service, band) * qty;
}

// Add-ons. Bands cover property size — add-ons are extra tasks only.
export const addOnData: Record<string, { name: string; price: number; service: ServiceType; description: string }> = {
  // House Cleaning
  oven: { name: 'Inside Oven Clean', price: 45, service: 'cleaning', description: 'Deep clean inside your oven' },
  fridge: { name: 'Inside Fridge Clean', price: 35, service: 'cleaning', description: 'Interior fridge scrub & wipe-down' },
  interiorWindows: { name: 'Interior Windows', price: 55, service: 'cleaning', description: 'All interior glass cleaned' },
  baseboards: { name: 'Deep Baseboard Scrub', price: 35, service: 'cleaning', description: 'Hand-detailed baseboards' },
  laundry: { name: 'Laundry — Wash, Dry & Fold (1 load)', price: 30, service: 'cleaning', description: 'One load, washed, dried, and folded' },
  cabinets: { name: 'Inside Kitchen Cabinets', price: 50, service: 'cleaning', description: 'Wipe inside all kitchen cabinets' },

  // Lawn Care
  hedge: { name: 'Hedge & Bush Trimming', price: 65, service: 'lawn', description: 'Shape and trim all hedges' },
  weed: { name: 'Weed Removal — Garden Beds', price: 45, service: 'lawn', description: 'Manual weed pulling in beds' },
  leaf: { name: 'Leaf & Debris Cleanup', price: 55, service: 'lawn', description: 'Full yard leaf and debris removal' },
  fertilization: { name: 'Fertilization Treatment', price: 75, service: 'lawn', description: 'Seasonal turf fertilizer' },
  pressureWash: { name: 'Driveway Pressure Wash', price: 150, service: 'lawn', description: 'Driveway and walkway pressure clean' },

  // Car Detailing — condition surcharges live here, never in a band.
  ozone: { name: 'Ozone Odor Treatment', price: 75, service: 'detailing', description: 'Eliminates trapped odors' },
  petHair: { name: 'Pet Hair Removal', price: 45, service: 'detailing', description: 'Thorough pet hair extraction' },
  engineBay: { name: 'Engine Bay Clean', price: 85, service: 'detailing', description: 'Hand-cleaned engine bay' },
  ceramicSpray: { name: 'Ceramic Spray Coat', price: 85, service: 'detailing', description: 'Hand spray coat & seal' },
};

// ---------------------------------------------------------------------------
// Display helpers — the single source for every price label in the UI.
// Prefer per-visit phrasing: totals depend on both band and cadence.
// ---------------------------------------------------------------------------

/** Headline (Standard-band) per-visit price for a service. */
export function getHeadlinePrice(service: ServiceType): number {
  return BAND_PRICES[service].standard;
}

/** Lowest per-visit price for a service (its Compact band). */
export function getServiceStartingPrice(service: ServiceType): number {
  return BAND_PRICES[service].compact;
}

/** Lowest per-visit price across all services. */
export function getLowestStartingPrice(): number {
  return Math.min(...(['cleaning', 'lawn', 'detailing'] as ServiceType[]).map(getServiceStartingPrice));
}

/** Cadence the bundle nudge pre-selects when adding a service. */
export const defaultBundleFrequency: Record<ServiceType, Frequency> = {
  cleaning: 'biweekly',
  lawn: 'monthly',
  detailing: 'monthly',
};

/** Formats a per-visit price, e.g. "$149 a visit". */
export function formatPerVisit(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)} a visit`;
}

/** Formats a monthly billed amount, e.g. "$298/mo". */
export function formatMonthly(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}/mo`;
}

/**
 * Bundle discount as a 0–1 fraction. Rates come from the shared map in
 * src/lib/bundle-discount.ts so the displayed price and the amount Stripe
 * charges are derived from the same source.
 */
export function getBundleDiscount(serviceCount: number): number {
  return getBundleDiscountPct(serviceCount) / 100;
}

/** True when any selected service is above Estate — quote by hand, never book. */
export function hasCustomQuote(state: ConfigState): boolean {
  return state.services.some((svc) => bandFor(state, svc) === 'custom');
}

export function calculatePricing(state: ConfigState) {
  const servicePrices = state.services.map((s) => ({
    service: s,
    band: bandFor(state, s),
    perVisit: getServicePerVisit(state, s),
    price: getServicePrice(state, s),
  }));

  const servicesSubtotal = servicePrices.reduce((sum, sp) => sum + sp.price, 0);

  const addOnsSubtotal = state.addOns.reduce((sum, id) => {
    const addon = addOnData[id];
    if (!addon) return sum;
    let price = addon.price;
    if (addon.service === 'detailing') price *= Math.max(1, state.vehicleCount);
    return sum + price;
  }, 0);

  // The bundle discount is charged as a Stripe coupon on the whole
  // subscription (percent_off applies to every recurring line item, add-ons
  // included), so the displayed discount is computed the same way.
  const subtotal = servicesSubtotal + addOnsSubtotal;
  const discountPercent = getBundleDiscount(state.services.length);
  const discountAmount = subtotal * discountPercent;
  const netTotal = subtotal - discountAmount;

  // Florida sales tax stays gated off (see src/lib/florida-tax.ts).
  const taxTriggered =
    FL_SALES_TAX_COLLECTION_ENABLED &&
    cartTriggersFloridaTax((state.addOns ?? []).map((addon_name) => ({ addon_name })));
  const taxPercent = taxTriggered ? FLORIDA_TAX.percentage / 100 : 0;
  const taxAmount = Math.round(netTotal * taxPercent * 100) / 100;
  const total = netTotal + taxAmount;

  const servicesTotal = servicesSubtotal - servicesSubtotal * discountPercent;
  const addOnsTotal = addOnsSubtotal - addOnsSubtotal * discountPercent;

  return {
    servicePrices,
    subtotal,
    servicesSubtotal,
    addOnsSubtotal,
    discountPercent,
    discountAmount,
    servicesTotal,
    addOnsTotal,
    /** Post-discount, pre-tax amount. */
    netTotal,
    taxTriggered,
    taxPercentage: taxTriggered ? FLORIDA_TAX.percentage : 0,
    taxAmount,
    /** Tax-inclusive totals — these are what Stripe actually charges. */
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

/** How each cadence reads in a sentence. */
export const frequencyVisitCopy: Record<Frequency, string> = {
  monthly: '1 visit a month',
  biweekly: '2 visits a month',
  weekly: '4 visits a month',
};

export const serviceLabels: Record<ServiceType, string> = {
  cleaning: 'House Cleaning',
  lawn: 'Lawn Care',
  detailing: 'Car Detailing',
};

export const serviceIcons: Record<ServiceType, string> = {
  cleaning: '🏠',
  lawn: '🌿',
  detailing: '🚗',
};

// localStorage helpers
const STORAGE_KEY = 'tidy_config';

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
      // Legacy carts stored the retired size tiers (standard/xl/custom). They
      // don't translate to bands, so drop them and re-ask.
      delete parsed.homeSize;
      delete parsed.yardSize;
      delete parsed.vehicleSize;
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
