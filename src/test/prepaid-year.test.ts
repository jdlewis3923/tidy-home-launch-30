import { describe, it, expect } from 'vitest';
import { yearlyPriceCents, cancelRefundCents, monthsUsed, renewalNoticeDate } from '@/lib/prepaidYear';

describe('Prepaid Year rules', () => {
  it('yearly price is 12 × monthly × 0.90 ($189 → $2,041.20)', () => {
    expect(yearlyPriceCents(18900)).toBe(204120);
  });
  it('cancel after 3 months charges $567 and refunds $1,474.20', () => {
    expect(cancelRefundCents(18900, 204120, 3)).toEqual({ charged: 56700, refund: 147420 });
  });
  it('a started month counts as used', () => {
    expect(monthsUsed('2026-11-16T00:00:00Z', '2027-02-17T00:00:00Z')).toBe(4);
    expect(monthsUsed('2026-11-16T00:00:00Z', '2027-02-16T00:00:00Z')).toBe(3);
  });
  it('founding members are charged their founding monthly rate', () => {
    expect(cancelRefundCents(15900, yearlyPriceCents(15900), 3)).toEqual({ charged: 47700, refund: 124020 });
  });
  it('renewal email goes 45 days before renewal', () => {
    expect(renewalNoticeDate('2027-11-16T00:00:00Z')).toBe('2027-10-02');
  });
});
