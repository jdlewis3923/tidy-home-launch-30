import { describe, it, expect } from 'vitest';
import { fillLifecycleCopy } from '@/lib/lifecycle-simulation';
import { lifecycleCanSend, lifecycleTemplatePair } from '../../supabase/functions/_shared/lifecycle-policy';
describe('lifecycle copy interpolation', () => {
  it('fills real values without leaving executable HTML', () => {
    expect(fillLifecycleCopy('<p>Hello {first}: {rating}</p>', { first: 'Ana', rating: 2 })).toBe('Hello Ana: 2');
  });
});
describe('shadow cutover rules', () => {
  const base = { shadow: true, test: false, forceShadow: false, eventBacked: true, eventLive: false, stageLive: true };
  it('unflipped event rows never send despite a live stage', () => expect(lifecycleCanSend(base)).toBe(false));
  it('only the event row being flipped permits its messages', () => expect(lifecycleCanSend({ ...base, eventLive: true })).toBe(true));
  it('is_test contacts never send even with live rules', () => expect(lifecycleCanSend({ ...base, eventLive: true, test: true })).toBe(false));
  it('simulation messages never send even with live rules', () => expect(lifecycleCanSend({ ...base, eventLive: true, forceShadow: true })).toBe(false));
  it('legacy stage toggles cannot bypass global shadow', () => expect(lifecycleCanSend({ ...base, eventBacked: false })).toBe(false));
  it('day-zero payment failures have an email fallback', () => expect(lifecycleTemplatePair('payment_failed_sms0')).toBe('payment_failed_email0'));
});