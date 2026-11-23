import { describe, expect, it } from 'vitest';
import source from './fixtures/service-scope-2026-11-23.json';
import { scopeChecklistItems, type ScopeRow } from '../lib/serviceScope';
import { CAR_CARE_DRAFT_PAY, buildCarCareICADraft } from '../lib/car-care-ica';
import { SHINE_FULL_DETAIL, SHINE_MAINTENANCE_WASH, LAWN_INCLUDED, CLEANING_INCLUDED } from '../lib/pricing-canon';
import { socialGiftExamples } from '../lib/socialCampaign';

const rows = source as ScopeRow[];
describe('scope work boundaries', () => {
  it('requires all wash work plus exactly six additional full-detail items', () => {
    const wash = scopeChecklistItems(rows, 'detailing', 'maintenance_wash');
    const detail = scopeChecklistItems(rows, 'detailing', 'full_detail');
    expect(wash).toHaveLength(10);
    expect(detail).toHaveLength(16);
    expect(detail.filter(item => item.key.startsWith('scope:car_detail:'))).toHaveLength(6);
    expect(detail.map(item => item.key)).toEqual(expect.arrayContaining(wash.map(item => item.key)));
  });
  it('never promotes paid car add-ons into required included work', () => {
    const detail = scopeChecklistItems(rows, 'detailing', 'full_detail');
    const paidKeys = rows.filter(row => row.service === 'car_detail' && row.section === 'add_on')
      .map(row => `scope:${row.service}:${row.sort_order}`);
    expect(paidKeys.length).toBeGreaterThan(0);
    expect(detail.filter(item => paidKeys.includes(item.key))).toHaveLength(0);
  });
  it('keeps quarterly deeper work out of a standard cleaning visit', () => {
    expect(scopeChecklistItems(rows, 'cleaning', 'standard')).toHaveLength(3);
    expect(scopeChecklistItems(rows, 'cleaning', 'quarterly_deep_clean')).toHaveLength(9);
    expect(scopeChecklistItems(rows, 'cleaning', 'standard').some(item => item.key.startsWith('scope:cleaning_deep_clean:'))).toBe(false);
  });
  it('uses every canonical lawn included item and no paid lawn add-on', () => {
    expect(scopeChecklistItems(rows, 'lawn', 'standard')).toHaveLength(7);
    expect(scopeChecklistItems(rows, 'lawn', 'standard').every(item => rows.some(row => row.section === 'included' && item.key === `scope:${row.service}:${row.sort_order}`))).toBe(true);
  });
  it('keeps compatibility inclusion exports equal to the authoritative scope rules', () => {
    for (const [service, actual] of [['car_detail', SHINE_FULL_DETAIL], ['car_wash', SHINE_MAINTENANCE_WASH], ['lawn', LAWN_INCLUDED], ['cleaning', CLEANING_INCLUDED]] as const) {
      expect(actual).toEqual(rows.filter(row => row.active && row.service === service && row.section === 'included').map(row => row.text_en));
    }
  });
});
describe('founding gift examples', () => {
  it('uses only eligible gifts at $55 or under', () => {
    const examples = socialGiftExamples();
    expect(examples).toHaveLength(4);
    expect(examples.every(addon => addon.price <= 55 && addon.giftEligible)).toBe(true);
    expect(examples.find(addon => addon.key === 'clay_bar_ceramic_coat')).toBeUndefined();
    expect(examples.find(addon => addon.key === 'bed_edge_reset')).toBeUndefined();
    const leaf = examples.find(addon => addon.key === 'leaf_debris_cleanup');
    if (!leaf) throw new Error('Expected the $55 replacement gift');
    expect(leaf.price).toBe(55);
    expect(socialGiftExamples([{ ...leaf, price: 56 }])).toEqual([]);
  });
});
describe('unsent Car Care ICA', () => {
  const base = 'INDEPENDENT CONTRACTOR AGREEMENT — LAWN CARE PRO Service: Lawn Care SCHEDULE A — PAY old SCHEDULE B — SERVICE SCOPE old';
  it('uses the exact approved wash pay', () => {
    expect(CAR_CARE_DRAFT_PAY.wash).toEqual([16, 20, 26]);
  });
  it('uses the exact approved full-detail pay', () => {
    expect(CAR_CARE_DRAFT_PAY.fullDetail).toEqual([78, 88, 115]);
  });
  it('pays 40 percent on authorized add-ons', () => {
    expect(CAR_CARE_DRAFT_PAY.addonPercent).toBe(40);
  });
  it('saves a draft outside automatic template issuance', () => {
    const draft = buildCarCareICADraft(base, rows);
    expect(draft.is_current).toBe(false);
    expect(draft.service).toBe('detailing');
  });
  it('refuses to generate an agreement without both current car scopes', () => {
    expect(() => buildCarCareICADraft(base, rows.filter(row => row.service !== 'car_detail'))).toThrow();
  });
});