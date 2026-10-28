import { describe, expect, it } from 'vitest';
import { isWindowOpen, nextOpenWindow } from '../../supabase/functions/_shared/sms-window';

describe('customer and Pro text courtesy hours', () => {
  it('opens at 8 AM Miami and closes at 6 PM Monday through Saturday', () => {
    expect(isWindowOpen(new Date('2026-10-26T11:59:00Z'))).toBe(false);
    expect(isWindowOpen(new Date('2026-10-26T12:00:00Z'))).toBe(true);
    expect(isWindowOpen(new Date('2026-10-26T21:59:00Z'))).toBe(true);
    expect(isWindowOpen(new Date('2026-10-26T22:00:00Z'))).toBe(false);
    expect(isWindowOpen(new Date('2026-10-24T12:00:00Z'))).toBe(true);
  });
  it('never opens on Sunday and releases held texts Monday at 8 AM', () => {
    expect(isWindowOpen(new Date('2026-10-25T16:00:00Z'))).toBe(false);
    expect(nextOpenWindow(new Date('2026-10-25T16:00:00Z')).toISOString()).toBe('2026-10-26T12:00:00.000Z');
  });
  it('keeps the same Miami hours after daylight saving time ends', () => {
    expect(isWindowOpen(new Date('2026-11-02T12:59:00Z'))).toBe(false);
    expect(isWindowOpen(new Date('2026-11-02T13:00:00Z'))).toBe(true);
    expect(isWindowOpen(new Date('2026-11-02T23:00:00Z'))).toBe(false);
  });
});