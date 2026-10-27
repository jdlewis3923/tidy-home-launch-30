import { describe, it, expect } from 'vitest';
import { CLEANING_MONTHLY, CLEANING_PER_VISIT, CLEANING_SIZES, CLEANING_BASE_PAY, ESTATE_BUDGET_HOURS, cleaningAnnualCents, cleaningLookupKey, cleaningSizeFromRange, sizeFromHomeSqFt, monthlyPrice, lookupKeyFor, cleaningSurchargePerVisit } from '@/lib/pricing-canon';

describe('cleaning expansion', () => {
  it.each([
    [1, [139,256,456], [139,128,114]],
    [2, [189,348,620], [189,174,155]],
    [3, [279,514,916], [279,257,229]],
    [4, [425,782,1396], [425,391,349]],
    [5, [595,1094,1952], [595,547,488]],
  ] as const)('locks size %s monthly charges and per-visit rounding', (size, monthly, perVisit) => {
    expect(['monthly','biweekly','weekly'].map(c => CLEANING_MONTHLY[size][c])).toEqual(monthly);
    expect(['monthly','biweekly','weekly'].map(c => CLEANING_PER_VISIT[size][c])).toEqual(perVisit);
  });
  it('locks every Estate yearly total in cents', () => {
    expect(['monthly','biweekly','weekly'].map(c => cleaningAnnualCents(4, c as 'monthly'))).toEqual([459000,844560,1507680]);
    expect(['monthly','biweekly','weekly'].map(c => cleaningAnnualCents(5, c as 'monthly'))).toEqual([642600,1181520,2108160]);
  });
  it.each([[1400,1],[1401,2],[2200,2],[2201,3],[3200,3],[3201,4],[4800,4],[4801,5],[7000,5],[7001,'quote']] as const)('square footage %s sets size %s', (sqft,size) => {
    expect(sizeFromHomeSqFt(sqft,1)).toBe(size);
  });
  it.each([[1,2,1],[1,2.5,2],[2,2.5,2],[2,3,3],[3,3.5,3],[3,4,4],[4,5,4],[4,5.5,5],[5,6.5,5],[5,7,'quote']] as const)('band %s bathroom count %s gives %s', (size,baths,result) => {
    expect(cleaningSizeFromRange(size,baths)).toBe(result);
  });
  it('uses the exact Estate lookup keys', () => {
    expect(cleaningLookupKey(4,'biweekly')).toBe('clean_estate_biweekly');
    expect(cleaningLookupKey(5,'weekly',true)).toBe('clean_estateplus_annual_weekly');
    expect(lookupKeyFor('cleaning',4,'monthly')).toBe('clean_estate_monthly');
  });
  it('never adds the retired cleaning surcharge to band pricing', () => {
    expect(cleaningSurchargePerVisit(3000)).toBe(0);
    expect(monthlyPrice('cleaning',4,'weekly',60)).toBe(1396);
  });
  it('keeps other services unchanged and refuses Estate vehicle sizes', () => {
    expect(monthlyPrice('lawn',2,'biweekly')).toBe(120);
    expect(monthlyPrice('detailing',3,'monthly')).toBe(239);
    expect(() => lookupKeyFor('lawn',4,'monthly')).toThrow('invalid_service_size');
  });
  it('locks Estate base pay and team budget metadata', () => {
    expect(CLEANING_SIZES).toEqual([1,2,3,4,5]);
    expect(CLEANING_BASE_PAY).toEqual({1:56,2:76,3:112,4:170,5:238});
    expect(ESTATE_BUDGET_HOURS).toEqual({4:6,5:8.7});
  });
});