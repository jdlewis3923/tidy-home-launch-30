/**
 * Guards for the two money-path blockers:
 *  1. square footage is REQUIRED for cleaning and lawn (it triggers the
 *     surcharge, and the pro's surcharge share);
 *  2. the lawn by-eye answer and the measured turf area are reconciled to the
 *     LARGER band, so "small yard" + 7,000 sq ft cannot buy the small price.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sizeForLawnReconciled } from '@/lib/dashboard-pricing';

const SERVER = readFileSync('supabase/functions/_shared/size-validation.ts', 'utf8');

describe('lawn size reconciliation (client)', () => {
  it('takes the larger band when the answer and the turf area disagree', () => {
    expect(sizeForLawnReconciled('small', 7000)).toBe(3);
    expect(sizeForLawnReconciled('large', 1000)).toBe(3);
    expect(sizeForLawnReconciled('small', 1000)).toBe(1);
    expect(sizeForLawnReconciled('standard', 5000)).toBe(2);
  });

  it('routes anything above every band to a hand quote', () => {
    expect(sizeForLawnReconciled('small', 12000)).toBe('quote');
    expect(sizeForLawnReconciled('over', 1000)).toBe('quote');
  });
});

describe('server size validation', () => {
  it('requires square footage for cleaning and lawn', () => {
    expect(SERVER).toContain('sq_ft_required');
    expect(SERVER).toMatch(/service === "cleaning" \|\| service === "lawn"\) && !sqFt/);
  });

  it('reads both lawn inputs rather than short-circuiting on the answer', () => {
    expect(SERVER).toContain('inputs.turf_sq_ft ? sizeFromTurfSqFt(inputs.turf_sq_ft)');
    expect(SERVER).toContain('Math.max(');
  });
});
