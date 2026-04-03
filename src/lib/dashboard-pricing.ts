// Types
export type ServiceType = 'cleaning' | 'lawn' | 'detailing';
export type Frequency = 'monthly' | 'biweekly' | 'weekly';
export type HomeSize = 'under1500' | '1500to2500' | '2500to3500' | 'over3500';
export type YardSize = 'small' | 'medium' | 'large';
export type VehicleType = 'sedan' | 'suv' | 'truck';

export interface ConfigState {
  services: ServiceType[];
  frequencies: Partial<Record<ServiceType, Frequency>>;
  homeSize: HomeSize | null;
  bedrooms: string | null;
  bathrooms: string | null;
  yardSize: YardSize | null;
  vehicleType: VehicleType | null;
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
  vehicleType: null,
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

// Pricing tables
const cleaningPrices: Record<HomeSize, Record<Frequency, number>> = {
  under1500: { monthly: 159, biweekly: 275, weekly: 459 },
  '1500to2500': { monthly: 199, biweekly: 345, weekly: 579 },
  '2500to3500': { monthly: 239, biweekly: 415, weekly: 689 },
  over3500: { monthly: 279, biweekly: 485, weekly: 799 },
};

const lawnPrices: Record<YardSize, Record<Frequency, number>> = {
  small: { monthly: 85, biweekly: 129, weekly: 195 },
  medium: { monthly: 115, biweekly: 175, weekly: 259 },
  large: { monthly: 149, biweekly: 229, weekly: 339 },
};

const detailingPrices: Record<VehicleType, Record<'monthly' | 'biweekly', number>> = {
  sedan: { monthly: 159, biweekly: 249 },
  suv: { monthly: 179, biweekly: 279 },
  truck: { monthly: 199, biweekly: 309 },
};

export const addOnData: Record<string, { name: string; price: number; service: ServiceType; description: string }> = {
  oven: { name: 'Oven cleaning', price: 45, service: 'cleaning', description: 'Deep clean inside your oven' },
  fridge: { name: 'Fridge cleaning', price: 40, service: 'cleaning', description: 'Interior fridge scrub & organize' },
  cabinet: { name: 'Cabinet cleaning', price: 55, service: 'cleaning', description: 'Inside all kitchen cabinets' },
  deepClean: { name: 'Deep clean upgrade', price: 95, service: 'cleaning', description: 'First visit intensive — recommended' },
  hedge: { name: 'Bush/hedge trimming', price: 65, service: 'lawn', description: 'Shape and trim all hedges' },
  weed: { name: 'Weed removal', price: 55, service: 'lawn', description: 'Manual weed pulling & treatment' },
  leaf: { name: 'Leaf cleanup', price: 80, service: 'lawn', description: 'Full yard leaf removal' },
  shampoo: { name: 'Interior shampoo', price: 70, service: 'detailing', description: 'Deep carpet & upholstery clean' },
  wax: { name: 'Wax & paint protection', price: 90, service: 'detailing', description: 'Hand wax & sealant coat' },
  petHair: { name: 'Pet hair removal', price: 60, service: 'detailing', description: 'Thorough pet hair extraction' },
};

export function getServicePrice(state: ConfigState, service: ServiceType): number {
  const freq = state.frequencies[service];
  if (!freq) return 0;

  if (service === 'cleaning') {
    if (!state.homeSize) return 0;
    return cleaningPrices[state.homeSize][freq];
  }
  if (service === 'lawn') {
    if (!state.yardSize) return 0;
    return lawnPrices[state.yardSize][freq];
  }
  if (service === 'detailing') {
    if (!state.vehicleType) return 0;
    if (freq === 'weekly') return 0;
    return detailingPrices[state.vehicleType][freq as 'monthly' | 'biweekly'] * state.vehicleCount;
  }
  return 0;
}

export function getBundleDiscount(serviceCount: number): number {
  if (serviceCount >= 3) return 0.20;
  if (serviceCount >= 2) return 0.15;
  return 0;
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

export const homeSizeLabels: Record<HomeSize, string> = {
  under1500: 'Under 1,500 sq ft',
  '1500to2500': '1,500–2,500 sq ft',
  '2500to3500': '2,500–3,500 sq ft',
  over3500: '3,500+ sq ft',
};

export const yardSizeLabels: Record<YardSize, string> = {
  small: 'Small (< 5,000 sq ft)',
  medium: 'Medium (5k–10k sq ft)',
  large: 'Large (10k+ sq ft)',
};

export const vehicleTypeLabels: Record<VehicleType, string> = {
  sedan: 'Sedan / Coupe',
  suv: 'SUV / Minivan',
  truck: 'Truck / Large SUV',
};

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
