/**
 * The chatbot knowledge base is customer-facing pricing. It answers the widget
 * on the homepage, the widget in the dashboard, and inbound SMS — all three via
 * `chatbot_knowledge ORDER BY updated_at DESC LIMIT 1`.
 *
 * Nothing used to test it, which is exactly how a stale price catalog survived
 * in there. This test reads the LIVE winning row (through the
 * chatbot-knowledge-figures function, which returns only the dollar figures)
 * and fails on any figure that is not in the pricing canon.
 */
import { describe, expect, it } from 'vitest';
import {
  BILLED_MONTHLY,
  CADENCES,
  CLEANING_SURCHARGE,
  LAWN_SURCHARGE,
  PER_VISIT_PRICES,
  REFERRAL_BONUS_CENTS,
  SHINE_MONTHLY,
  SIZES,
} from '@/lib/pricing-canon';
import { ADDON_CATALOG } from '@/lib/addon-catalog';

/** Every dollar figure the canon authorises inside customer-facing copy. */
function canonFigures(): Set<number> {
  const allowed = new Set<number>();
  for (const size of SIZES) {
    for (const cadence of CADENCES) {
      allowed.add(PER_VISIT_PRICES.cleaning[size][cadence]);
      allowed.add(PER_VISIT_PRICES.lawn[size][cadence]);
      allowed.add(BILLED_MONTHLY.cleaning[size][cadence]);
      allowed.add(BILLED_MONTHLY.lawn[size][cadence]);
    }
    allowed.add(SHINE_MONTHLY[size]);
  }
  allowed.add(CLEANING_SURCHARGE.perVisitDollars);
  allowed.add(LAWN_SURCHARGE.perVisitDollars);
  for (const addon of ADDON_CATALOG) allowed.add(addon.price);
  allowed.add(REFERRAL_BONUS_CENTS / 100); // referral: give $50 / get $50

  // Non-price figures that legitimately appear in the knowledge base.
  allowed.add(25); // review bonus per qualifying 5-star review
  allowed.add(100); // review bonus monthly cap
  allowed.add(1_000_000); // GL per occurrence
  allowed.add(2_000_000); // GL aggregate
  return allowed;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

describe('live chatbot knowledge base vs pricing canon', () => {
  it('quotes no dollar figure that is not in canon', async () => {
    expect(SUPABASE_URL, 'VITE_SUPABASE_URL must be set').toBeTruthy();

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/chatbot-knowledge-figures`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {}),
      },
      body: '{}',
    });
    expect(resp.status, 'knowledge figures endpoint must answer').toBe(200);

    const body = (await resp.json()) as { figures: string[]; updated_at: string };
    expect(Array.isArray(body.figures)).toBe(true);
    expect(body.figures.length).toBeGreaterThan(10);

    const allowed = canonFigures();
    const offenders = body.figures.filter(
      (raw) => !allowed.has(Number(raw.replace(/,/g, ''))),
    );

    expect(
      offenders,
      `The live chatbot knowledge row (updated ${body.updated_at}) quotes figures that are not in ` +
        `src/lib/pricing-canon.ts: ${offenders.map((o) => `$${o}`).join(', ')}. ` +
        'Write a NEW chatbot_knowledge row with the corrected prices — never string-replace the old one.',
    ).toEqual([]);
  }, 20000);
});
