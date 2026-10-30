import { describe, expect, it } from 'vitest';
import { homeProfileCanAddPhotos, estateFirstVisitCost } from '@/lib/home-profile';
describe('home policy limits', () => {
  it('allows six photos, refuses a seventh', () => { expect(homeProfileCanAddPhotos(5,1)).toBe(true); expect(homeProfileCanAddPhotos(6,1)).toBe(false); });
  it('records Estate first-visit cost as $85', () => { expect(estateFirstVisitCost(4)).toBe(85); });
  it('records Estate Plus first-visit cost as $119', () => { expect(estateFirstVisitCost(5)).toBe(119); });
});