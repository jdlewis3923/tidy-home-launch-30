import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('keeps customer and email guide versions identical', () => {
  expect(readFileSync('src/lib/memberGuide.ts', 'utf8')).toBe(readFileSync('supabase/functions/_shared/member-guide.ts', 'utf8'));
});