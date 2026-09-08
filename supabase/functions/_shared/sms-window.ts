// Tidy — FTSA/TCPA send window helper.
//
// Florida's FTSA allows solicitation calls/texts 08:00–20:00 local time and
// carries a private right of action with statutory damages per message, so Tidy
// keeps a tighter window: 08:00–18:00 America/New_York, Monday–Saturday.
// Sunday is never a send day.
//
// A message that lands outside the window is QUEUED (public.sms_outbox) and
// released by the sms-outbox-release cron. It is never dropped.

export const WINDOW_OPEN_HOUR = 8;
export const WINDOW_CLOSE_HOUR = 18;

function etParts(d: Date): { hour: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = map[parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'] ?? 0;
  return { hour: Number.isFinite(hour) ? hour : 0, weekday };
}

export function easternHour(now = new Date()): number {
  return etParts(now).hour;
}

export function easternWeekday(now = new Date()): number {
  return etParts(now).weekday;
}

export function isSundayET(now = new Date()): boolean {
  return etParts(now).weekday === 0;
}

/** True when the clock is outside 08:00–18:00 ET. */
export function isQuietHours(now = new Date()): boolean {
  const { hour } = etParts(now);
  return !(hour >= WINDOW_OPEN_HOUR && hour < WINDOW_CLOSE_HOUR);
}

/** True when a message may be sent right now (window open and not Sunday). */
export function isWindowOpen(now = new Date()): boolean {
  return !isSundayET(now) && !isQuietHours(now);
}

/** Why the window is closed, for the outbox row. */
export function closedReason(now = new Date()): 'sunday_quiet_hours' | 'quiet_hours' | null {
  if (isSundayET(now)) return 'sunday_quiet_hours';
  if (isQuietHours(now)) return 'quiet_hours';
  return null;
}

/**
 * Next instant the window is open, resolved by stepping forward in 30-minute
 * hops (DST-safe because every check re-reads the ET wall clock).
 */
export function nextOpenWindow(now = new Date()): Date {
  if (isWindowOpen(now)) return now;
  let cursor = new Date(now.getTime());
  for (let i = 0; i < 24 * 8 * 2; i++) {
    cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
    if (isWindowOpen(cursor)) {
      // Snap to the top of the ET hour so releases cluster predictably.
      return new Date(Math.ceil(cursor.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000);
    }
  }
  return new Date(now.getTime() + 12 * 60 * 60 * 1000);
}

export type OutboxRow = {
  to_phone_e164: string;
  body?: string | null;
  content_sid?: string | null;
  content_variables?: Record<string, string> | null;
  idempotency_key: string;
  template_name?: string | null;
  triggered_by?: string | null;
};

/**
 * Park a message until the window opens. Idempotency-key collisions are
 * treated as "already queued" so a retrying caller cannot double-queue.
 */
export async function queueSms(
  // deno-lint-ignore no-explicit-any
  admin: any,
  row: OutboxRow,
  reason: string,
  releaseAfter: Date,
): Promise<{ queued: boolean; release_after: string; error?: string }> {
  const { error } = await admin.from('sms_outbox').insert({
    to_phone_e164: row.to_phone_e164,
    body: row.body ?? null,
    content_sid: row.content_sid ?? null,
    content_variables: row.content_variables ?? null,
    idempotency_key: row.idempotency_key,
    template_name: row.template_name ?? null,
    triggered_by: row.triggered_by ?? null,
    queued_reason: reason,
    release_after: releaseAfter.toISOString(),
    status: 'queued',
  });
  if (error) {
    // 23505 = duplicate idempotency key: the message is already parked.
    if ((error as { code?: string }).code === '23505') {
      return { queued: true, release_after: releaseAfter.toISOString() };
    }
    return { queued: false, release_after: releaseAfter.toISOString(), error: error.message };
  }
  return { queued: true, release_after: releaseAfter.toISOString() };
}
