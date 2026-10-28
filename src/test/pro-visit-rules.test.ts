import { describe, expect, it } from 'vitest';
import { accessWindowOpen, distanceMeters, navigationLinks, pinecrestLawnHoursAllowed, PRO_GPS_RADIUS_METERS, PRO_LOCKOUT_WAIT_MINUTES } from '../lib/pro-visit-rules';

describe('Pro closed-loop requirements', () => {
  it('opens access exactly 30 minutes before the window, never after checkout', () => {
    const start='2026-10-28T14:00:00Z';
    expect(accessWindowOpen(start,false,Date.parse('2026-10-28T13:29:59Z'))).toBe(false);
    expect(accessWindowOpen(start,false,Date.parse('2026-10-28T13:30:00Z'))).toBe(true);
    expect(accessWindowOpen(start,true,Date.parse(start))).toBe(false);
  });
  it('uses the requested Google directions destination and encodes addresses', () => {
    expect(navigationLinks('1 Main St, Pinecrest FL').google).toBe('https://www.google.com/maps/dir/?api=1&destination=1%20Main%20St%2C%20Pinecrest%20FL');
    expect(navigationLinks('1 Main St').apple).toBe('https://maps.apple.com/?daddr=1%20Main%20St');
    expect(navigationLinks('1 Main St').waze).toBe('https://waze.com/ul?q=1%20Main%20St&navigate=yes');
  });
  it('requires the 150 m radius and 15 minute lockout wait', () => {
    expect(PRO_GPS_RADIUS_METERS).toBe(150);
    expect(PRO_LOCKOUT_WAIT_MINUTES).toBe(15);
    expect(distanceMeters({lat:25,lng:-80},{lat:25.001,lng:-80})).toBeLessThan(150);
    expect(distanceMeters({lat:25,lng:-80},{lat:25.002,lng:-80})).toBeGreaterThan(150);
  });
  it('allows weekday Pinecrest lawn starts only from 8 AM to before 5 PM', () => {
    expect(pinecrestLawnHoursAllowed(new Date('2026-10-28T11:59:00Z'))).toBe(false);
    expect(pinecrestLawnHoursAllowed(new Date('2026-10-28T12:00:00Z'))).toBe(true);
    expect(pinecrestLawnHoursAllowed(new Date('2026-10-28T21:00:00Z'))).toBe(false);
  });
  it('allows Saturday Pinecrest lawn only from 9 AM to before 2 PM and never Sunday', () => {
    expect(pinecrestLawnHoursAllowed(new Date('2026-10-31T12:59:00Z'))).toBe(false);
    expect(pinecrestLawnHoursAllowed(new Date('2026-10-31T13:00:00Z'))).toBe(true);
    expect(pinecrestLawnHoursAllowed(new Date('2026-10-31T18:00:00Z'))).toBe(false);
    expect(pinecrestLawnHoursAllowed(new Date('2026-11-01T15:00:00Z'))).toBe(false);
  });
});