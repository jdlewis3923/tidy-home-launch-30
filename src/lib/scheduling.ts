/**
 * Scheduling v3 — client helpers. The database owns every rule (service days,
 * claims, capacity, 14-day/48-hour notice, moves); screens only call the
 * `customer_*`, `pro_*` and `admin_*` RPCs and render what they return.
 */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
export const DAY_NAME: Record<number, string> = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };
export const DAY_SHORT: Record<number, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
export const DAY_NAME_ES: Record<number, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
export type SchedService = "cleaning" | "lawn" | "detailing";
export const SCHED_SERVICES: SchedService[] = ["cleaning", "lawn", "detailing"];
export const SERVICE_NAME: Record<string, string> = { cleaning: "Cleaning", lawn: "Lawn", detailing: "Car Care" };
export const SERVICE_NAME_ES: Record<string, string> = { cleaning: "Limpieza", lawn: "Césped", detailing: "Cuidado del Auto" };

/** Pro claim hours: 8:00 am – 6:00 pm, whole hours. */
export const HOUR_OPTIONS = Array.from({ length: 11 }, (_, i) => 8 + i);
export const hourLabel = (h: number) => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "pm" : "am"}`;
export const hhmm = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Readable copy for server refusals. */
export const SCHED_ERRORS: Record<string, string> = {
  catchup_required: "Pick your catch-up day first.",
  catchup_conflict: "That's your catch-up day. Pick a different catch-up day first.",
  catchup_is_a_work_day: "You already work that day. Pick a day you don't work.",
  taken: "Another Pro just claimed this day.",
  not_served: "Tidy doesn't serve this ZIP on that day.",
  not_your_service: "That service isn't on your profile.",
  hours_invalid: "Hours must be between 8:00 am and 6:00 pm, at least 4 hours.",
  no_sunday: "Sunday is never a service day.",
  inside_48h: "That's less than 48 hours away. Text us and we'll sort it.",
  no_room: "That day just filled up. Pick another.",
  day_not_offered: "That day isn't available.",
  entry_method_required: "Tell us how we get in.",
  outside_7_days: "Pick a date within 7 days of the original.",
  pro_not_working: "Your Pro doesn't work that day.",
  over_capacity: "That date is full.",
  window_taken: "That window is taken that day.",
  date_closed: "Tidy is closed that day.",
  already_off: "That date is already marked off.",
  date_passed: "That date has passed.",
  before_launch: "Visits start on launch day.",
  reason_required: "Type a reason.",
  forbidden: "You don't have access to this.",
};
export function schedError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e ?? "");
  const key = Object.keys(SCHED_ERRORS).find((k) => msg.includes(k));
  return key ? SCHED_ERRORS[key] : "Something went wrong. Try again.";
}

/** Parse YYYY-MM-DD as a local calendar date (no timezone shift). */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(iso: string, n: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
export function prettyDay(iso: string, lang: "en" | "es" = "en"): string {
  return parseDay(iso).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "long", month: "long", day: "numeric" });
}
