import { describe, expect, it } from 'vitest';
import { INVITE_AT, FINISH_AT, NUDGE_AT, ARCHIVE_AT, canNudge, canArchive, weekdaysOnly } from '../../supabase/functions/_shared/hire-ready-rules';
describe('Oct 22 hire-ready timing', () => {
  it('schedules at 8 AM Eastern October 22', () => expect(INVITE_AT).toBe('2026-10-22T12:00:00.000Z'));
  it('allows 24 hours to finish', () => expect(Date.parse(FINISH_AT) - Date.parse(INVITE_AT)).toBe(24 * 3600000));
  it('makes one nudge due at 20 hours', () => expect(Date.parse(NUDGE_AT) - Date.parse(INVITE_AT)).toBe(20 * 3600000));
  it('nudges only a non-submitted zero-answer application', () => { expect(canNudge(false, 0)).toBe(true); expect(canNudge(false, 1)).toBe(false); expect(canNudge(true, 0)).toBe(false); });
  it('archives only at 48 hours without submission', () => { expect(Date.parse(ARCHIVE_AT) - Date.parse(INVITE_AT)).toBe(48 * 3600000); expect(canArchive(false, new Date('2026-10-24T11:59:59Z'))).toBe(false); expect(canArchive(false, new Date(ARCHIVE_AT))).toBe(true); expect(canArchive(true, new Date(ARCHIVE_AT))).toBe(false); });
  it('accepts weekday screens and refuses weekend screens in Eastern time', () => { expect(weekdaysOnly('2026-10-23T22:00:00Z')).toBe(true); expect(weekdaysOnly('2026-10-24T22:00:00Z')).toBe(false); expect(weekdaysOnly('2026-10-25T22:00:00Z')).toBe(false); });
});