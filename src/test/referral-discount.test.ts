// The referred friend's $50 off first month.
//
// /refer promises "They get $50 off their first month". For a long time the
// checkout sent no discount at all, so the friend paid full price. These tests
// pin the coupon onto both checkout paths and pin every skip rule.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  REFERRAL_COUPON_ID,
  resolveReferralDiscount,
} from '../../supabase/functions/_shared/referral-discount';

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

const CHECKOUT = 'supabase/functions/stripe-create-checkout/index.ts';
const EMBEDDED = 'supabase/functions/create-stripe-payment-intent/index.ts';

/** Minimal supabase stub: profiles lookup + invoices lookup + log insert. */
function stubSupabase(opts: {
  referrerUserId?: string | null;
  paidInvoices?: number;
  profileError?: string;
}) {
  const inserted: unknown[] = [];
  const supabase = {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                opts.profileError
                  ? { data: null, error: { message: opts.profileError } }
                  : { data: opts.referrerUserId ? { user_id: opts.referrerUserId } : null, error: null },
            }),
          }),
        };
      }
      if (table === 'invoices') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: async () => ({
                  data: Array.from({ length: opts.paidInvoices ?? 0 }, (_, i) => ({ id: `in_${i}` })),
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return { insert: async (row: unknown) => { inserted.push(row); return { error: null }; } };
    },
  };
  return { supabase, inserted };
}

describe('1. valid referral code, first order', () => {
  it('applies the uncapped $50 coupon', async () => {
    const { supabase } = stubSupabase({ referrerUserId: 'user-referrer' });
    const d = await resolveReferralDiscount({ supabase, code: 'tidy-abc12', userId: 'user-friend' });
    expect(d.apply).toBe(true);
    expect(d.coupon).toBe('REFERRAL_50_OFF_FIRST_MONTH');
    expect(d.reason).toBe('applied');
    expect(d.code).toBe('TIDY-ABC12'); // normalized for metadata
  });

  it('the coupon id is a plain coupon, never a promotion code', () => {
    expect(REFERRAL_COUPON_ID).toBe('REFERRAL_50_OFF_FIRST_MONTH');
    for (const p of [CHECKOUT, EMBEDDED]) {
      expect(read(p)).not.toContain('promotion_code');
      expect(read(p)).not.toContain('allow_promotion_codes');
    }
  });

  it('both checkout paths attach it as discounts[0].coupon', () => {
    expect(read(CHECKOUT)).toContain('sessionParams.discounts = [{ coupon: referralDiscount.coupon }]');
    expect(read(EMBEDDED)).toContain('subParams.discounts = [{ coupon: referralDiscount.coupon }]');
  });

  it('metadata still carries the referral code for the webhook payout half', () => {
    for (const p of [CHECKOUT, EMBEDDED]) {
      expect(read(p)).toContain('referral_code: (input.referral_code ?? "").trim().toUpperCase()');
      expect(read(p)).toContain('recordReferralAttribution');
    }
  });
});

describe('2. unknown code', () => {
  it('no discount, no throw, reason recorded', async () => {
    const { supabase } = stubSupabase({ referrerUserId: null });
    const d = await resolveReferralDiscount({ supabase, code: 'NOPE-9999', userId: 'user-friend' });
    expect(d.apply).toBe(false);
    expect(d.coupon).toBeUndefined();
    expect(d.reason).toBe('unknown_code');
  });

  it('a lookup failure degrades to no discount rather than a failed checkout', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { supabase } = stubSupabase({ profileError: 'connection reset' });
    const d = await resolveReferralDiscount({ supabase, code: 'TIDY-ABC12', userId: 'u' });
    expect(d.apply).toBe(false);
    expect(d.reason).toBe('lookup_failed');
    spy.mockRestore();
  });
});

describe('3. self referral', () => {
  it('is refused', async () => {
    const { supabase } = stubSupabase({ referrerUserId: 'user-friend' });
    const d = await resolveReferralDiscount({ supabase, code: 'TIDY-SELF1', userId: 'user-friend' });
    expect(d.apply).toBe(false);
    expect(d.reason).toBe('self_referral');
  });
});

describe('4. not the first order', () => {
  it('a customer with a paid invoice gets no first-month discount', async () => {
    const { supabase } = stubSupabase({ referrerUserId: 'user-referrer', paidInvoices: 1 });
    const d = await resolveReferralDiscount({ supabase, code: 'TIDY-ABC12', userId: 'user-friend' });
    expect(d.apply).toBe(false);
    expect(d.reason).toBe('not_first_order');
  });
});

describe('5. no referral code at all', () => {
  it('is a no-op with nothing logged', async () => {
    const { supabase } = stubSupabase({});
    for (const code of [undefined, null, '   ']) {
      const d = await resolveReferralDiscount({ supabase, code, userId: 'u' });
      expect(d).toEqual({ apply: false, reason: 'no_code', code: '' });
    }
  });

  it('the discount is only ever set behind the apply flag', () => {
    for (const p of [CHECKOUT, EMBEDDED]) {
      const src = read(p);
      const lines = src.split('\n').filter((l) => l.includes('.discounts ='));
      expect(lines).toHaveLength(1);
      expect(src).toContain('if (referralDiscount.apply && referralDiscount.coupon) {');
    }
  });
});

describe('6. bundling produces no coupon, so it cannot collide', () => {
  it('no percentage or bundle coupon machinery exists on either path', () => {
    for (const p of [CHECKOUT, EMBEDDED]) {
      const src = read(p);
      for (const dead of ['TIDY_BUNDLE_', 'percent_off', 'allow_promotion_codes']) {
        expect(src).not.toContain(dead);
      }
    }
  });

  it('the bundle gift is free car washes recorded in metadata', () => {
    for (const p of [CHECKOUT, EMBEDDED]) {
      expect(read(p)).toContain('free_addons_per_month: String(freeAddons)');
    }
  });
});

describe('7. attribution params survive', () => {
  it('every tracked key is still written into subscription metadata', () => {
    for (const p of [CHECKOUT, EMBEDDED]) {
      const src = read(p);
      for (const key of [
        'qr_route: input.qr_route',
        'qr_zip: input.qr_zip',
        'qr_placement: input.qr_placement',
        'landing_source: input.landing_source',
        'lang: input.lang',
        'utm_source: input.utm_source',
        'utm_medium: input.utm_medium',
        'utm_campaign: input.utm_campaign',
        'utm_content: input.utm_content',
        'utm_term: input.utm_term',
        'gclid: input.gclid',
      ]) {
        expect(src).toContain(key);
      }
    }
  });
});
