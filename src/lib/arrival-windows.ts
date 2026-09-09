/**
 * Canonical arrival windows — the ONLY window strings any surface may show.
 *
 * These match exactly what `generate_recurring_visits` writes into
 * `visits.time_window`. Never hardcode a window string in a component; import
 * from here (edge functions import the mirror at
 * `supabase/functions/_shared/arrival-windows.ts`).
 */
export const ARRIVAL_WINDOW_MORNING = '8:00 AM – 12:00 PM';
export const ARRIVAL_WINDOW_AFTERNOON = '12:00 PM – 5:00 PM';
export const ARRIVAL_WINDOW_NO_PREFERENCE = '9:00 AM – 1:00 PM';

export const ARRIVAL_WINDOWS = [
  ARRIVAL_WINDOW_MORNING,
  ARRIVAL_WINDOW_AFTERNOON,
  ARRIVAL_WINDOW_NO_PREFERENCE,
] as const;

export type ArrivalWindow = (typeof ARRIVAL_WINDOWS)[number];

/** Shown instead of a clock time when the visit row has no window yet. */
export const ARRIVAL_WINDOW_PENDING_LABEL = 'Arrival window confirmed before your visit';

/** Never invent a time: pass through the stored window or the pending label. */
export function arrivalWindowLabel(timeWindow: string | null | undefined): string {
  return timeWindow?.trim() ? timeWindow : ARRIVAL_WINDOW_PENDING_LABEL;
}
