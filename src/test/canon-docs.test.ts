/**
 * Drift guard for every document, guide and knowledge source. Fails when any of
 * them says something the canon retired (polos/tees, hedge trimming, eco-safe,
 * disinfect, bagged clippings, redo credits, one-time deep cleans, old detail
 * pay, bundle discounts) or quotes an add-on price / Pro pay off canon.
 * A sentence that NEGATES a term ("no polos", "never bagged") is allowed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIVING_DOCS, buildDoc, docPlainText, type DocSources } from '@/lib/livingDocs';
import { ADDON_CATALOG } from '@/lib/addon-catalog';
import { CONTRACTOR_SHINE_PAY, CLEANING_BASE_PAY, DEEP_CLEAN_PRICE, DEEP_CLEAN_PRO_PAY_PCT } from '@/lib/pricing-canon';
import { MEMBER_GUIDE } from '@/lib/memberGuide';
import { ORIENTATION_COPY } from '@/lib/orientation';

const DRIFT: [string, RegExp][] = [
  ['polo', /\bpolos?\b/i],
  ['tee (uniform)', /\b(tees|t-shirts?)\b|camisetas?\b/i],
  ['hedge trim', /hedge trim|poda de arbustos/i],
  ['eco-safe', /eco-?safe|eco-friendly|ecológic/i],
  ['disinfect', /disinfect|desinfect/i],
  ['bagged clippings', /(bag(ged|ging)?|embols\w*|recoger)[^.]{0,40}(clipping|grama)|clippings?[^.]{0,40}\bbag/i],
  ['redo credit', /credit (instead of|in place of)[^.]{0,20}redo|crédito en lugar/i],
  ['one-time deep clean', /one-time deep clean|limpieza profunda única/i],
  ['old detail pay', /detail[^.]{0,60}\$(51|61|82)\b|\$(51|61|82)\b[^.]{0,60}detail/i],
  ['bundle discount', /bundle discount|descuento por paquete/i],
];
const NEGATION = /\b(never|no|not|nor|nunca|sin|ni|retired|withdrawn)\b/i;

function hits(label: string, text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).flatMap((s) =>
    DRIFT.filter(([, re]) => re.test(s) && !NEGATION.test(s)).map(([t]) => `${label}: [${t}] ${s.trim().slice(0, 160)}`));
}

const fixture: DocSources = {
  scope: [
    { id: '1', service: 'cleaning', section: 'included', text_en: 'Wipe counters', text_es: 'Limpiar mesones', group_en: 'Kitchen', group_es: 'Cocina', notice_key: null, addon_key: null, sort_order: 1, scope_version: 1, active: true },
    { id: '2', service: 'lawn', section: 'not_included', text_en: 'Hedges', text_es: 'Setos', group_en: null, group_es: null, notice_key: null, addon_key: null, sort_order: 1, scope_version: 1, active: true },
    { id: '3', service: 'cleaning_deep_clean', section: 'included', text_en: 'Inside oven', text_es: 'Dentro del horno', group_en: null, group_es: null, notice_key: null, addon_key: 'deep_clean', sort_order: 1, scope_version: 1, active: true },
  ],
  contracts: [{ service: 'cleaning', lang: 'en', version: '2026-10-29b', body: 'SCHEDULE A  Rates per visit.  SCHEDULE B  Scope.', created_at: '2026-10-29', is_current: true }],
};

const read = (p: string) => readFileSync(p, 'utf8');
const SOURCE_FILES = [
  'src/components/FAQ.tsx', 'src/contexts/LanguageContext.tsx', 'src/lib/emailTemplates.ts',
  'supabase/functions/_shared/reservation-emails.ts', 'supabase/functions/_shared/pro-emails.ts',
  'supabase/functions/_shared/pro-onboarding.ts', 'supabase/functions/_shared/pro-send.ts',
  ...readdirSync('supabase/functions/_shared/templates').map((f) => `supabase/functions/_shared/templates/${f}`),
];

describe('living documents', () => {
  for (const def of LIVING_DOCS) for (const lang of ['en', 'es'] as const) {
    it(`${def.slug} (${lang}) has no retired wording`, () => {
      expect(hits(def.slug, docPlainText(buildDoc(def, fixture, lang)))).toEqual([]);
    });
  }
  it('add-on tables quote catalog price and 40% pay', () => {
    for (const svc of ['cleaning', 'lawn', 'car'] as const) {
      const text = docPlainText(buildDoc(LIVING_DOCS.find((d) => d.slug === `addons-${svc}`)!, fixture, 'en'));
      for (const a of ADDON_CATALOG.filter((x) => x.service === (svc === 'car' ? 'detailing' : svc))) {
        expect(text).toContain(`${a.name} $${a.price} $${Number.isInteger(a.price * 0.4) ? a.price * 0.4 : (a.price * 0.4).toFixed(2)}`);
      }
    }
  });
  it('Deep Clean, Estate and detail pay come from canon', () => {
    const pay = docPlainText(buildDoc(LIVING_DOCS.find((d) => d.slug === 'pay-cleaning')!, fixture, 'en'));
    for (const s of [1, 2, 3, 4, 5] as const) expect(pay).toContain(`$${DEEP_CLEAN_PRICE[s] * DEEP_CLEAN_PRO_PAY_PCT / 100}`);
    expect(pay).toContain(`$${CLEANING_BASE_PAY[4] * 1.5}`);
    expect(pay).toContain(`$${CLEANING_BASE_PAY[5] * 1.5}`);
    const car = docPlainText(buildDoc(LIVING_DOCS.find((d) => d.slug === 'pay-car')!, fixture, 'en'));
    for (const s of [1, 2, 3] as const) expect(car).toContain(`$${CONTRACTOR_SHINE_PAY[s].fullDetail}`);
  });
  it('Deep Clean canon matches the requested prices', () => {
    expect(DEEP_CLEAN_PRICE).toEqual({ 1: 149, 2: 179, 3: 219, 4: 289, 5: 389 });
    expect(DEEP_CLEAN_PRO_PAY_PCT).toBe(40);
  });
});

describe('guides and templates', () => {
  it('Member Guide (EN/ES)', () => {
    const text = MEMBER_GUIDE.flatMap((s) => [...s.en.items, ...s.es.items]).join('\n');
    expect(hits('member guide', text)).toEqual([]);
    expect(text).toContain('we come back within 48 hours, free');
  });
  it('orientation copy (EN/ES)', () => {
    const text = Object.values(ORIENTATION_COPY).flat().flatMap((b) => [b.title, b.body, b.es]).join('\n');
    expect(hits('orientation', text)).toEqual([]);
  });
  for (const f of SOURCE_FILES) it(f, () => expect(hits(f, read(f))).toEqual([]));
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
describe('live knowledge sources', () => {
  it('newest chatbot row and onboarding modules have no retired wording', async () => {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/chatbot-knowledge-figures`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {}) }, body: '{}',
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as { sentences: string[]; onboarding_hits: { slug: string; term: string }[]; onboarding_count: number };
    expect(hits('chatbot', body.sentences.join('\n'))).toEqual([]);
    expect(body.sentences.some((s) => /deep clean/i.test(s) && /\$149/.test(s))).toBe(true);
    expect(body.onboarding_count).toBeGreaterThan(10);
    expect(body.onboarding_hits).toEqual([]);
  }, 20000);
});
