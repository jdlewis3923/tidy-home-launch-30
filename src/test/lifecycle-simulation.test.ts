import { describe, it, expect } from 'vitest';
import { fillLifecycleCopy } from '@/lib/lifecycle-simulation';
describe('lifecycle copy interpolation', () => {
  it('fills real values without leaving executable HTML', () => {
    expect(fillLifecycleCopy('<p>Hello {first}: {rating}</p>', { first: 'Ana', rating: 2 })).toBe('Hello Ana: 2');
  });
});