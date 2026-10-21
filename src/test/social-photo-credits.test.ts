import { describe, expect, it } from 'vitest';
import { socialPhotoCredit } from '@/lib/socialPhotoCredits';

describe('LinkedIn photo attribution', () => {
  const credit = { date: '2026-12-04', time_et: '12:30 PM', photographer: 'Ron Lach', photo_page: 'https://www.pexels.com/photo/man-in-white-shirt-carrying-a-girl-in-white-shirt-10044369/' };
  it('reads the date, time, photographer and source without losing existing hold notes', () => {
    expect(socialPhotoCredit(`Held until Zap repair.\nLinkedIn photo credit: ${JSON.stringify(credit)}`)).toEqual(credit);
  });
  it('does not turn an untrusted source into an admin link', () => {
    expect(socialPhotoCredit(`LinkedIn photo credit: ${JSON.stringify({ ...credit, photo_page: 'javascript:alert(1)' })}`)).toBeNull();
  });
  it('leaves posts without supplied attribution unchanged', () => {
    expect(socialPhotoCredit('Held until Zap repair.')).toBeNull();
  });
});