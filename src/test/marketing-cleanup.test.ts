import { describe, expect, it } from 'vitest';
import { HEARD_FROM, validHeardFrom } from '@/lib/heard-from';
import { nextdoorScheduledFor } from '@/lib/socialCampaign';
describe('marketing booking rules', () => {
  it('requires one of the six owner-approved discovery channels', () => {
    expect(HEARD_FROM).toEqual(['door_hanger','google','nextdoor','facebook_instagram','referral','other']);
    for (const value of HEARD_FROM) expect(validHeardFrom(value)).toBe(true);
    expect(validHeardFrom('')).toBe(false);
    expect(validHeardFrom('made_up')).toBe(false);
  });
  it('Nextdoor starts November 26 at 6 PM Miami and repeats every 14 days', () => {
    expect(Array.from({ length: 5 }, (_, i) => nextdoorScheduledFor('2026-11-26', i).toISOString())).toEqual([
      '2026-11-26T23:00:00.000Z','2026-12-10T23:00:00.000Z','2026-12-24T23:00:00.000Z','2027-01-07T23:00:00.000Z','2027-01-21T23:00:00.000Z',
    ]);
  });
});