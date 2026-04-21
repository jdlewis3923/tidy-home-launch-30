// Referral discount applied to first month when a valid promo code is present.
// Stored in cents to mirror Stripe; UI converts to dollars for display.
// Edit this single constant to change the displayed discount amount.
export const REFERRAL_DISCOUNT_CENTS = 5000;

// Types
export type ServiceType = 'cleaning' | 'lawn' | 'detailing';
export type Frequency = 'monthly' | 'biweekly' | 'weekly';

// Final 3-tier size logic. Each service uses exactly:
//   standard  → included in base price
//   xl        → flat per-visit upcharge
//   custom    → above max threshold; do NOT auto-price (manual quote)
export type SizeTier = 'standard' | 'xl' | 'custom';

export interface ConfigState {
  services: ServiceType[];
  frequencies: Partial<Record<ServiceType, Frequency>>;
  homeSize: SizeTier | null;
  bedrooms: string | null;
  bathrooms: string | null;
  yardSize: SizeTier | null;
  vehicleSize: SizeTier | null;
  vehicleCount: number;
  firstName: string;
  lastName: string;
  email: string;
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
  homeSize: null,
  bedrooms: null,
  bathrooms: null,
  yardSize: null,
  vehicleSize: null,
  vehicleCount: 1,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  zip: '',
  accessNotes: '',
  preferredDay: '',
  preferredTime: '',
  referralCode: '',
  addOns: [],
  smsConsent: true,
  outOfCoverage: false,
};

// Base recurring prices — flat per-visit, by frequency.
// Size upgrades are applied as additive per-visit upcharges (see XL_UPCHARGE).
const cleaningPrices: Record<Frequency, number> = {
  monthly: 159,
  biweekly: 275,
  weekly: 459,
};

const lawnPrices: Record<Frequency, number> = {
  monthly: 85,
  biweekly: 129,
  weekly: 195,
};

const detailingPrices: Record<'monthly' | 'biweekly', number> = {
  monthly: 159,
  biweekly: 249,
};

// Extra Large per-visit upcharge by service.
export const XL_UPCHARGE: Record<ServiceType, number> = {
  cleaning: 60,
  lawn: 30,
  detailing: 30, // per vehicle
};

// Human-readable size tier copy (for dashboard helper text + summaries).
export const sizeTierCopy: Record<ServiceType, Record<SizeTier, { label: string; helper: string }>> = {
  cleaning: {
    standard: { label: 'Standard', helper: 'Up to 2,500 sq ft interior livable space' },
    xl: { label: 'Extra Large', helper: '2,501–4,000 sq ft · +$60/visit' },
    custom: { label: 'Custom Quote', helper: 'Over 4,000 sq ft — we\'ll send a personal quote' },
  },
  lawn: {
    standard: { label: 'Standard', helper: 'Up to 4,000 sq ft mowable turf' },
    xl: { label: 'Extra Large', helper: '4,001–7,500 sq ft mowable turf · +$30/visit' },
    custom: { label: 'Custom Quote', helper: 'Over 7,500 sq ft — we\'ll send a personal quote' },
  },
  detailing: {
    standard: { label: 'Standard', helper: 'Sedan, coupe, hatchback, crossover, or 2-row SUV' },
    xl: { label: 'Extra Large', helper: '3-row SUV, full-size truck, or large van · +$30/vehicle' },
    custom: { label: 'Custom Quote', helper: 'Commercial van, lifted truck, or oversized vehicle' },
  },
};

// Add-ons. Size upgrades are NOT add-ons — these are extra tasks only.
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

  // Car Detailing
  ozone: { name: 'Ozone Odor Treatment', price: 75, service: 'detailing', description: 'Eliminates trapped odors' },
  petHair: { name: 'Pet Hair Removal', price: 45, service: 'detailing', description: 'Thorough pet hair extraction' },
  engineBay: { name: 'Engine Bay Clean', price: 85, service: 'detailing', description: 'Hand-cleaned engine bay' },
  ceramicSpray: { name: 'Ceramic Spray Coat', price: 85, service: 'detailing', description: 'Hand spray coat & seal' },
};

export function getServicePrice(state: ConfigState, service: ServiceType): number {
  const freq = state.frequencies[service];
  if (!freq) return 0;

  if (service === 'cleaning') {
    if (!state.homeSize || state.homeSize === 'custom') return 0;
    const base = cleaningPrices[freq];
    return base + (state.homeSize === 'xl' ? XL_UPCHARGE.cleaning : 0);
  }
  if (service === 'lawn') {
    if (!state.yardSize || state.yardSize === 'custom') return 0;
    const base = lawnPrices[freq];
    return base + (state.yardSize === 'xl' ? XL_UPCHARGE.lawn : 0);
  }
  if (service === 'detailing') {
    if (!state.vehicleSize || state.vehicleSize === 'custom') return 0;
    if (freq === 'weekly') return 0;
    const base = detailingPrices[freq as 'monthly' | 'biweekly'];
    const perVehicle = base + (state.vehicleSize === 'xl' ? XL_UPCHARGE.detailing : 0);
    return perVehicle * state.vehicleCount;
  }
  return 0;
}

export function getBundleDiscount(serviceCount: number): number {
  if (serviceCount >= 3) return 0.20;
  if (serviceCount >= 2) return 0.15;
  return 0;
}

// Returns true when ANY selected service has a Custom Quote tier — in this
// case the dashboard hides auto-pricing and routes to the contact flow.
export function hasCustomQuote(state: ConfigState): boolean {
  if (state.services.includes('cleaning') && state.homeSize === 'custom') return true;
  if (state.services.includes('lawn') && state.yardSize === 'custom') return true;
  if (state.services.includes('detailing') && state.vehicleSize === 'custom') return true;
  return false;
}

export function calculatePricing(state: ConfigState) {
  const servicePrices = state.services.map(s => ({
    service: s,
    price: getServicePrice(state, s),
  }));

  const subtotal = servicePrices.reduce((sum, sp) => sum + sp.price, 0);
  const discountPercent = getBundleDiscount(state.services.length);
  const discountAmount = subtotal * discountPercent;
  const servicesTotal = subtotal - discountAmount;

  const addOnsTotal = state.addOns.reduce((sum, id) => {
    const addon = addOnData[id];
    if (!addon) return sum;
    let price = addon.price;
    if (addon.service === 'detailing') price *= state.vehicleCount;
    return sum + price;
  }, 0);

  return {
    servicePrices,
    subtotal,
    discountPercent,
    discountAmount,
    servicesTotal,
    addOnsTotal,
    firstMonth: servicesTotal + addOnsTotal,
    ongoing: servicesTotal,
  };
}

export const VALID_ZIPS = ['33183', '33186', '33156'];

export const frequencyLabels: Record<Frequency, string> = {
  monthly: 'Monthly',
  biweekly: 'Biweekly',
  weekly: 'Weekly',
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
    if (raw) return { ...defaultState, ...JSON.parse(raw) };
  } catch {}
  return { ...defaultState };
}

export function saveState(state: ConfigState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
