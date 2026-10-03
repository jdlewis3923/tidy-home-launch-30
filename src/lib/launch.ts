// Launch canon — the ONE place the first-visit date and founding cap live.
// Mirrored byte-for-byte at supabase/functions/_shared/launch.ts (parity-tested).
// Change the date here, copy this file over the mirror, done.

/** First visits begin on this date (YYYY-MM-DD, Miami time). */
export const LAUNCH_DATE_ISO = '2026-11-09';
/** Founding spots per service. */
export const FOUNDING_CAP = 25;
/** While true the quote ends in "Reserve your spot" instead of checkout. */
export const RESERVATIONS_MODE = true;

const d = new Date(`${LAUNCH_DATE_ISO}T12:00:00Z`);
/** e.g. "Monday, November 9" */
export const LAUNCH_DATE_LONG = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
/** e.g. "lunes, 9 de noviembre" */
export const LAUNCH_DATE_LONG_ES = d.toLocaleDateString('es-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
/** e.g. "November" — the month we confirm pros and cards in. */
export const LAUNCH_MONTH = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });

export const RESERVABLE_SERVICES = ['cleaning', 'lawn', 'detailing'] as const;
export type ReservableService = (typeof RESERVABLE_SERVICES)[number];
export const RESERVATION_SERVICE_LABEL: Record<ReservableService, string> = {
  cleaning: 'Cleaning', lawn: 'Lawn care', detailing: 'Car Care',
};
/** Hiring triggers per service. */
export const RESERVATION_ALERTS = [
  { at: 10, key: 'first_pro', title: (svc: string) => `Advance your first ${svc} pro` },
  { at: 30, key: 'pro_2', title: (svc: string) => `Advance ${svc} pro #2` },
] as const;
