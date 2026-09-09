import { describe, it, expect, vi, afterEach } from 'vitest';
import { vendorFetch, timeoutForUrl, DEFAULT_TIMEOUT_MS } from '../../supabase/functions/_shared/http.ts';

describe('vendor timeouts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('has a per-vendor deadline for every money/messaging vendor', () => {
    expect(timeoutForUrl('https://api.twilio.com/2010-04-01/Accounts/x/Messages.json')).toBe(10_000);
    expect(timeoutForUrl('https://api.brevo.com/v3/smtp/email')).toBe(15_000);
    expect(timeoutForUrl('https://api.stripe.com/v1/subscriptions')).toBe(20_000);
    expect(timeoutForUrl('https://graph.facebook.com/v21.0/me')).toBe(20_000);
    expect(timeoutForUrl('https://api.checkr.com/v1/invitations')).toBe(15_000);
    expect(timeoutForUrl('https://anything-else.example.com/x')).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('never bounds the AI gateway (aborting still bills, and it is slow by design)', () => {
    expect(timeoutForUrl('https://ai.gateway.lovable.dev/v1/chat/completions')).toBeNull();
  });

  it('aborts a hanging vendor call instead of holding the invocation open', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_u, init) => {
      return new Promise((_res, rej) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener('abort', () => rej(new Error('aborted')));
      });
    });

    await expect(
      vendorFetch('https://api.twilio.com/slow', { timeoutMs: 20 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(spy).toHaveBeenCalled();
  });

  it('passes an unbounded call straight through with no signal', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    await vendorFetch('https://ai.gateway.lovable.dev/v1/chat/completions', { method: 'POST' });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeUndefined();
  });
});
