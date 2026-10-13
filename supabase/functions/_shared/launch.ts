// Launch canon — founding cap, reservable services and launch-date formatting.
// Mirrored byte-for-byte at supabase/functions/_shared/launch.ts (parity-tested).
// Edit dates at /admin/launch-dates; edit this file here, then copy it over the mirror.

/** Founding spots per service. */
export const FOUNDING_CAP = 25;
/** While true the quote ends in "Reserve your spot" instead of checkout. */
export const RESERVATIONS_MODE = true;

// Launch DATES are not in code. They live in the launch_config table (one row per
// service + a global row for door hanger drops), edited at /admin/launch-dates.
// This file only formats them, so pages, emails and texts all read the same row.
export type LaunchScope = 'cleaning' | 'lawn' | 'car';
export interface LaunchRow {
  scope: LaunchScope | 'global';
  first_visit_date: string | null;
  conversion_date: string | null;
  pro_callback_date: string | null;
  pro_ready_by: string | null;
  late_first_visit_week: string | null;
  hanger_drops: { start: string; end: string }[] | null;
}
export type LaunchConfig = Partial<Record<LaunchScope | 'global', LaunchRow>>;

/** Map any service key used in the app to its launch_config row. */
export function launchScope(service: string): LaunchScope {
  return ['detailing', 'car', 'car_care', 'car_wash', 'car_detail', 'shine'].includes(service) ? 'car' : service === 'lawn' ? 'lawn' : 'cleaning';
}

/** Long ("Monday, <Month> <day>"), short ("Monday, <Mon> <day>") or month-name formatting, EN or ES. */
export function fmtLaunchDate(iso: string | null | undefined, lang: 'en' | 'es' = 'en', style: 'long' | 'short' | 'month' = 'long'): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (style === 'month') return d.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'long', timeZone: 'UTC' });
  return d.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'long', month: style === 'short' ? 'short' : 'long', day: 'numeric', timeZone: 'UTC' });
}

export function firstVisitFor(cfg: LaunchConfig | undefined, service: string): string | null {
  return cfg?.[launchScope(service)]?.first_visit_date ?? null;
}

/** Customer copy while car care has no date (it opens when demand fills a route). No final period: callers add it. */
export const CAR_OPENS_LINE = {
  en: "Car care opens as soon as enough neighbors in your area reserve it. Reserve now, no card needed, and you'll be first in line",
  es: 'El cuidado de autos abre en cuanto suficientes vecinos de tu zona lo reserven. Reserva ahora, sin tarjeta, y serás de los primeros',
} as const;
/** Car Pro copy while car care has no date. */
export const CAR_PRO_ROUTE_LINE = {
  en: 'Your first route starts once 10 members reserve in your area. We confirm the date at least a week ahead.',
  es: 'Tu primera ruta comienza cuando 10 miembros reserven en tu zona. Confirmamos la fecha con al menos una semana de anticipación.',
} as const;
export function carHasDate(cfg: LaunchConfig | undefined): boolean {
  return !!cfg?.car?.first_visit_date;
}

/**
 * One sentence with the right start date(s) for the services in play. With no
 * services (or a mix) it names both, so a car care customer never sees the
 * cleaning/lawn date alone. With no car date, car care gets the "opens as soon as" line.
 */
export function startsLine(cfg: LaunchConfig | undefined, lang: 'en' | 'es' = 'en', services?: string[], style: 'long' | 'short' = 'long'): string {
  if (!cfg) return '';
  const scopes = new Set((services?.length ? services : ['cleaning', 'car']).map(launchScope));
  const home = fmtLaunchDate(cfg.cleaning?.first_visit_date ?? cfg.lawn?.first_visit_date, lang, style);
  const car = fmtLaunchDate(cfg.car?.first_visit_date, lang, style);
  const hasHome = scopes.has('cleaning') || scopes.has('lawn');
  const hasCar = scopes.has('car');
  if (hasHome && hasCar) {
    if (!car) {
      return lang === 'es'
        ? `Limpieza y jardín comienzan el ${home}. ${CAR_OPENS_LINE.es}`
        : `Cleaning and lawn begin ${home}. ${CAR_OPENS_LINE.en}`;
    }
    return lang === 'es'
      ? `Limpieza y jardín comienzan el ${home}; cuidado del auto comienza el ${car}`
      : `Cleaning and lawn begin ${home}; car care begins ${car}`;
  }
  if (hasCar) {
    if (!car) return CAR_OPENS_LINE[lang];
    return lang === 'es' ? `Cuidado del auto comienza el ${car}` : `Car care begins ${car}`;
  }
  return lang === 'es' ? `Las primeras visitas comienzan el ${home}` : `First visits begin ${home}`;
}

/** The date a member's first visit falls on: their weekday on/after the first-visit date, skipping blackout days a week. */
export function firstVisitOn(startIso: string, weekday: string, blackouts: string[] = []): string | null {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const wd = names.indexOf(weekday.trim().toLowerCase().split(/[\s,]/)[0]);
  if (wd < 0) return null;
  const d = new Date(`${startIso.slice(0, 10)}T12:00:00Z`);
  while (d.getUTCDay() !== wd) d.setUTCDate(d.getUTCDate() + 1);
  while (blackouts.includes(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

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

/** The founding service-area ZIPs — the ONE list every page and function reads. */
export const FOUNDING_ZIPS = ['33156', '33183', '33186'] as const;
/** Founding-member benefits, worded exactly as printed on the door hanger (service-specific Pro wording). */
export const FOUNDING_BENEFITS = ['Your price never rises', "First visit perfect or it's free", 'Free premium add-on on visit one', 'The same pro for each service, every visit'] as const;
