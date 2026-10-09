/**
 * Guards for the money-path size rules:
 *  1. interior square footage is REQUIRED for cleaning; lawn is NEVER measured
 *     by the customer — Tidy verifies turf area from aerial imagery;
 *  2. lawn bands are turf-only sq ft, inclusive at the top: 3,000 / 7,000 /
 *     12,000, above 12,000 is a custom quote;
 *  3. the by-eye answer and a measured turf area reconcile to the LARGER band.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sizeForLawnReconciled } from '@/lib/dashboard-pricing';
import { lawnBandFromSqFt, sizeFromTurfSqFt } from '@/lib/pricing-canon';

const SERVER = readFileSync('supabase/functions/_shared/size-validation.ts', 'utf8');
const MIGRATION = readFileSync('drizzle/migrations/0123_lawn_size_verification.sql', 'utf8');

describe('lawn bands (turf only, inclusive at the top)', () => {
  it.each([
    [2999, '1'], [3000, '1'], [3001, '2'],
    [6999, '2'], [7000, '2'], [7001, '3'],
    [11999, '3'], [12000, '3'], [12001, 'custom'],
  ])('%i sq ft → %s', (sqft, band) => {
    expect(lawnBandFromSqFt(sqft)).toBe(band);
  });
  it('database derivation uses the same bands', () => {
    expect(MIGRATION).toContain("WHEN _sqft <= 3000 THEN '1' WHEN _sqft <= 7000 THEN '2'");
    expect(MIGRATION).toContain("WHEN _sqft <= 12000 THEN '3' ELSE 'custom'");
  });
  it('quote above 12,000', () => expect(sizeFromTurfSqFt(12001)).toBe('quote'));
});

describe('lawn size reconciliation (client)', () => {
  it('takes the larger band when the answer and the turf area disagree', () => {
    expect(sizeForLawnReconciled('small', 7001)).toBe(3);
    expect(sizeForLawnReconciled('large', 1000)).toBe(3);
    expect(sizeForLawnReconciled('small', 1000)).toBe(1);
    expect(sizeForLawnReconciled('standard', 5000)).toBe(2);
  });
  it('routes anything above every band to a hand quote', () => {
    expect(sizeForLawnReconciled('small', 12001)).toBe('quote');
    expect(sizeForLawnReconciled('over', 1000)).toBe('quote');
  });
});

describe('server size validation', () => {
  it('requires square footage for cleaning only', () => {
    expect(SERVER).toContain('sq_ft_required');
    expect(SERVER).toMatch(/service === "cleaning" && !sqFt/);
  });
  it('reads both lawn inputs rather than short-circuiting on the answer', () => {
    expect(SERVER).toContain('inputs.turf_sq_ft ? sizeFromTurfSqFt(inputs.turf_sq_ft)');
    expect(SERVER).toContain('Math.max(');
  });
  it('blocks unverified lawn conversion in the database', () => {
    expect(MIGRATION).toContain("WHEN r.lawn_verified_at IS NULL THEN 'lawn_unverified'");
    expect(MIGRATION).toContain('BEFORE INSERT OR UPDATE OF status ON public.subscriptions');
  });
});
