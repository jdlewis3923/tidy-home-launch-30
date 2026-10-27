import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('keeps customer and server prepaid-year math identical', () => {
  expect(readFileSync('src/lib/prepaidYear.ts', 'utf8')).toBe(readFileSync('supabase/functions/_shared/prepaid-year.ts', 'utf8'));
});
