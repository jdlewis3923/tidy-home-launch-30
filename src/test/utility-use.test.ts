import { describe, expect, it } from 'vitest';
import { utilityAnswersComplete } from '../lib/utility-use';

describe('factual utility availability at booking', () => {
  it('accepts a home that has both outdoor utilities', () => {
    expect(utilityAnswersComplete(true, true)).toBe(true);
  });
  it('accepts No when a home genuinely has no spigot or outlet', () => {
    expect(utilityAnswersComplete(false, false)).toBe(true);
    expect(utilityAnswersComplete(false, true)).toBe(true);
    expect(utilityAnswersComplete(true, false)).toBe(true);
  });
  it('does not treat missing answers as a factual No', () => {
    expect(utilityAnswersComplete(null, false)).toBe(false);
    expect(utilityAnswersComplete(true, undefined)).toBe(false);
    expect(utilityAnswersComplete('No', true)).toBe(false);
  });
});
