import { describe, expect, it } from 'vitest';
import { routeReminderDays } from '../../supabase/functions/_shared/pro-route-timing';
import { ownerAlertWindowOpen } from '../../supabase/functions/_shared/owner-alert-window';

describe('approved Miami route timing', () => {
  it('sends at 5:45 PM, not 5:44 PM or 6 PM', () => {
    expect(routeReminderDays(new Date('2026-10-28T21:44:00Z'))).toEqual([]);
    expect(routeReminderDays(new Date('2026-10-28T21:45:00Z'))).toEqual(['2026-10-29']);
    expect(routeReminderDays(new Date('2026-10-28T22:00:00Z'))).toEqual([]);
  });
  it('includes Monday in Saturday’s 5:45 PM send', () => {
    expect(routeReminderDays(new Date('2026-10-31T21:45:00Z'))).toEqual(['2026-11-01', '2026-11-02']);
  });
  it('never produces a Sunday text, including after DST changes', () => {
    expect(routeReminderDays(new Date('2026-11-01T22:45:00Z'))).toEqual([]);
  });
  it('keeps 5:45 PM local time after DST ends', () => {
    expect(routeReminderDays(new Date('2026-11-02T22:45:00Z'))).toEqual(['2026-11-03']);
    expect(routeReminderDays(new Date('2026-11-02T21:45:00Z'))).toEqual([]);
  });
});

describe('separate owner alert hours', () => {
  it('allows 8 AM through the 9 PM digest, including Sunday, but no overnight alerts', () => {
    expect(ownerAlertWindowOpen(new Date('2026-11-01T12:59:00Z'))).toBe(false);
    expect(ownerAlertWindowOpen(new Date('2026-11-01T13:00:00Z'))).toBe(true);
    expect(ownerAlertWindowOpen(new Date('2026-11-02T02:00:00Z'))).toBe(true);
    expect(ownerAlertWindowOpen(new Date('2026-11-02T02:01:00Z'))).toBe(false);
  });
});