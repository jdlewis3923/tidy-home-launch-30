import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Car Care pay repair scope', () => {
  it('audits both Stripe modes and never changes prices or activation', () => {
    const source = readFileSync('supabase/functions/car-care-pay-metadata/index.ts', 'utf8');
    expect(source).toContain('CONTRACTOR_SHINE_PAY');
    expect(source).toContain('STRIPE_TEST_SECRET_KEY');
    expect(source).toContain('STRIPE_SECRET_KEY');
    expect(source).toContain('verify_scheduler');
    expect(source).not.toMatch(/prices\.create|products\.update|active:\s*true|unit_amount:\s*\w/);
  });

  it('repairs only Car Care email rows from canon, preserving the existing Partner uplift', () => {
    const source = readFileSync('supabase/functions/brevo-brand-audit/index.ts', 'utf8');
    const repair = source.slice(source.indexOf("=== 'car-pay'"), source.indexOf("=== 'pay'"));
    expect(repair).toContain('CONTRACTOR_SHINE_PAY');
    expect(repair).toContain('TIER_2_UPLIFT');
    expect(repair).toContain('Maintenance wash');
    expect(repair).toContain('Full detail');
    expect(repair).not.toContain("subject:");
  });
});