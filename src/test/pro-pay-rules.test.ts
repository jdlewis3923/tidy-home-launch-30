import { describe, expect, it } from 'vitest';
import { teamBaseCents, splitTeam, addonCents, outcomeCents, tier2Qualifies, tier2UpliftCents, insuranceMonths, payWeek, proNameMatch, memberNameMatch, reviewDecision } from '../../supabase/functions/_shared/pro-pay-rules';

describe('Pro pay canon', () => {
  it('cleaning base by size', () => {
    expect([1, 2, 3].map((s) => teamBaseCents('cleaning', s, 'standard'))).toEqual([5600, 7600, 11200]);
    expect(teamBaseCents('cleaning', 4, 'standard')).toBe(17000);
    expect(teamBaseCents('cleaning', 5, 'standard')).toBe(23800);
  });
  it('Estate Plus is $119 each for a two-person team', () => expect(splitTeam(23800, 2)).toEqual([11900, 11900]));
  it('first Estate visit is 1.5x', () => {
    expect(teamBaseCents('cleaning', 4, 'standard', true)).toBe(25500);
    expect(teamBaseCents('cleaning', 5, 'standard', true)).toBe(35700);
  });
  it('lawn and car flat rates', () => {
    expect([1, 2, 3].map((s) => teamBaseCents('lawn', s, 'standard'))).toEqual([1800, 2600, 4000]);
    expect([1, 2, 3].map((s) => teamBaseCents('detailing', s, 'maintenance'))).toEqual([1600, 2000, 2600]);
    expect([1, 2, 3].map((s) => teamBaseCents('detailing', s, 'full_detail'))).toEqual([7800, 8800, 11500]);
  });
  it('add-ons and Deep Clean pay 40%', () => { expect(addonCents(4500)).toBe(1800); expect(addonCents(17900)).toBe(7160); });
  it('lockout and late cancel pay 50%', () => { expect(outcomeCents(7600, 'lockout')).toBe(3800); expect(outcomeCents(7600, 'late_cancel')).toBe(3800); });
  it('second redo within 60 days pays $0', () => { expect(outcomeCents(7600, 'redo', false)).toBe(3800); expect(outcomeCents(7600, 'redo', true)).toBe(0); });
  it('Tier 2 needs 50 visits, 4.8 rating, 60 days', () => {
    expect(tier2Qualifies(50, 4.8, 60)).toBe(true);
    expect(tier2Qualifies(49, 5, 90)).toBe(false);
    expect(tier2Qualifies(60, 4.79, 90)).toBe(false);
    expect(tier2Qualifies(60, 4.9, 59)).toBe(false);
    expect(tier2UpliftCents(10000)).toBe(1000);
  });
  it('insurance reimbursement covers three months', () => expect(insuranceMonths(new Date('2026-11-20T15:00:00Z'))).toEqual(['2026-11', '2026-12', '2027-01']));
  it('pay week runs Mon–Sun, paid the following Friday', () => expect(payWeek(new Date('2026-11-04T18:00:00Z'))).toEqual({ week_start: '2026-11-02', week_end: '2026-11-08', payout_friday: '2026-11-13' }));
  it('review matching: exact auto, fuzzy pending, repeat member ineligible', () => {
    expect(proNameMatch('Susan was amazing', 'Susan')).toBe('exact');
    expect(proNameMatch('Suzan was amazing', 'Susan')).toBe('fuzzy');
    expect(memberNameMatch('Maria Lopez', 'Maria', 'Lopez')).toBe('exact');
    expect(memberNameMatch('Maria L.', 'Maria', 'Lopez')).toBe('fuzzy');
    expect(reviewDecision(5, 'exact', 'exact', false)).toBe('auto');
    expect(reviewDecision(5, 'fuzzy', 'exact', false)).toBe('pending');
    expect(reviewDecision(5, 'exact', 'exact', true)).toBe('ineligible');
    expect(reviewDecision(4, 'exact', 'exact', false)).toBe('ineligible');
  });
});
