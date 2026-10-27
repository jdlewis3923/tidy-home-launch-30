import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADDON_CATALOG } from '@/lib/addon-catalog';

// Every add-on name a member can see must have a Spanish translation in the
// language dictionary — pickers render t(display_name).
describe('add-on names are bilingual', () => {
  const dict = readFileSync('src/contexts/LanguageContext.tsx', 'utf8');
  for (const addon of ADDON_CATALOG) {
    it(`"${addon.name}" has a Spanish translation`, () => {
      expect(dict).toContain(`"${addon.name}":`);
    });
  }
});
