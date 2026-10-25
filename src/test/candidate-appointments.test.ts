import { describe, expect, it } from 'vitest';
import { appointmentLabel, bookedAppointments } from '@/lib/candidate-appointments';
describe('candidate appointments', () => {
 const now = Date.parse('2026-10-25T01:09:00Z');
 it('prioritizes upcoming bookings and excludes unbooked slots', () => {
  const slots = bookedAppointments([{kind:'phone',starts_at:'2026-10-22T23:30:00Z',status:'booked'},{kind:'phone',starts_at:'2026-10-26T22:30:00Z',status:'booked'},{kind:'phone',starts_at:'2026-10-26T20:30:00Z',status:'open'}],now);
  expect(slots.map(s=>s.starts_at)).toEqual(['2026-10-26T22:30:00Z','2026-10-22T23:30:00Z']);
 });
 it('shows appointment time in Miami',()=>expect(appointmentLabel({kind:'phone',starts_at:'2026-10-26T22:30:00Z',status:'booked'},now)).toContain('6:30 PM ET'));
 it('does not mark a past booking completed',()=>expect(appointmentLabel({kind:'phone',starts_at:'2026-10-22T23:30:00Z',status:'booked'},now)).toContain('PAST booking'));
});
