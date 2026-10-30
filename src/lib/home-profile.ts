export const HOME_PHOTO_LIMIT = 6;
export type HomeProfile = { offLimits?: string; presentation?: string; surfaces?: string; products?: string; ownProducts?: boolean; notes?: string; photos?: string[] };
export const HOME_PROFILE_FIELDS = [
  ['offLimits', 'Off-limits rooms', 'Habitaciones restringidas'],
  ['presentation', 'Beds, pillows and towels', 'Camas, almohadas y toallas'],
  ['surfaces', 'Marble, stone, hardwood or other surfaces', 'Mármol, piedra, madera u otras superficies'],
  ['products', 'Products to use or avoid', 'Productos para usar o evitar'],
  ['notes', 'Notes', 'Notas'],
] as const;
export function homeProfileCanAddPhotos(current: number, added: number) { return current + added <= HOME_PHOTO_LIMIT; }
export function estateFirstVisitCost(size: number) { return size === 4 ? 85 : size === 5 ? 119 : 0; }