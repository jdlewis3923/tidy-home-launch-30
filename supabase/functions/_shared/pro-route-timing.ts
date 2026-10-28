import { addDays, etDate } from './pro-day-digest.ts';

/** Only server-clock invocations in the 5:45 PM minute may produce routes. */
export function routeReminderDays(now = new Date()): string[] {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit',
    minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  if (parts.weekday === 'Sun' || parts.hour !== '17' || parts.minute !== '45') return [];
  const today = etDate(now);
  // Preserve Sunday's route notice on Saturday too, if Sunday work exists.
  return parts.weekday === 'Sat' ? [addDays(today, 1), addDays(today, 2)] : [addDays(today, 1)];
}