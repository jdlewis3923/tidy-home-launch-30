import { describe, expect, it } from 'vitest';
import { connecteamApplyUrl } from '@/lib/connecteamApply';

describe('Connecteam application destinations', () => {
  for (const [service, id] of [
    ['cleaning', '950932e9-a9c3-4160-bbc9-bd0a1ae4d1ab'],
    ['lawn', '7fd96f05-4ce2-4179-b162-be193866b2af'],
    ['car', '57cecc27-b3e7-447f-a427-726a5e4404a6'],
  ] as const) {
    it(`uses the approved ${service} form and preserves src`, () => {
      const url = new URL(connecteamApplyUrl(service, 'hanger & Indeed'));
      const params = new URLSearchParams(url.hash.split('?')[1]);
      expect(url.origin).toBe('https://app.connecteam.com');
      expect(params.get('link')).toBe(id);
      expect(params.get('src')).toBe('hanger & Indeed');
      expect(params.has('resume')).toBe(false);
    });
  }
});