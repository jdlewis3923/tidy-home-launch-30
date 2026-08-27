import { describe, it, expect, vi } from 'vitest';
// Deno-style specifier resolves fine under vitest since the helper is plain TS.
import { sendBrevoEmail } from '../../supabase/functions/_shared/brevo-send';

const SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const CONTACT_PREFIX = 'https://api.brevo.com/v3/contacts/';

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body?: unknown } | Error) {
  const calls: string[] = [];
  const impl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    const out = handler(u, init);
    if (out instanceof Error) throw out;
    return {
      ok: out.status >= 200 && out.status < 300,
      status: out.status,
      json: async () => out.body ?? {},
      text: async () => JSON.stringify(out.body ?? {}),
    } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const base = {
  to: 'person@example.com',
  templateId: 42,
  params: { first_name: 'Jane' },
  apiKey: 'test-key',
};

describe('sendBrevoEmail opt-out enforcement', () => {
  it('does not send to a blacklisted contact', async () => {
    const { impl, calls } = mockFetch((url) =>
      url.startsWith(CONTACT_PREFIX)
        ? { status: 200, body: { email: 'person@example.com', emailBlacklisted: true } }
        : { status: 201, body: { messageId: 'should-not-happen' } },
    );
    const res = await sendBrevoEmail({ ...base, marketing: true, fetchImpl: impl });
    expect(res).toMatchObject({ sent: false, reason: 'blacklisted' });
    expect(calls.some((c) => c === SEND_URL)).toBe(false);
  });

  it('sends to a non-blacklisted contact', async () => {
    const { impl, calls } = mockFetch((url) =>
      url.startsWith(CONTACT_PREFIX)
        ? { status: 200, body: { emailBlacklisted: false } }
        : { status: 201, body: { messageId: 'mid-1' } },
    );
    const res = await sendBrevoEmail({ ...base, marketing: true, fetchImpl: impl });
    expect(res.sent).toBe(true);
    expect(res.messageId).toBe('mid-1');
    expect(calls).toContain(SEND_URL);
  });

  it('sends when the contact lookup returns 404', async () => {
    const { impl, calls } = mockFetch((url) =>
      url.startsWith(CONTACT_PREFIX)
        ? { status: 404, body: { code: 'document_not_found' } }
        : { status: 201, body: { messageId: 'mid-2' } },
    );
    const res = await sendBrevoEmail({ ...base, marketing: true, fetchImpl: impl });
    expect(res.sent).toBe(true);
    expect(calls).toContain(SEND_URL);
  });

  it('sends when the contact lookup errors (fails open)', async () => {
    const { impl, calls } = mockFetch((url) =>
      url.startsWith(CONTACT_PREFIX)
        ? new Error('brevo down')
        : { status: 201, body: { messageId: 'mid-3' } },
    );
    const res = await sendBrevoEmail({ ...base, marketing: true, fetchImpl: impl });
    expect(res.sent).toBe(true);
    expect(calls).toContain(SEND_URL);

    const { impl: impl500, calls: calls500 } = mockFetch((url) =>
      url.startsWith(CONTACT_PREFIX)
        ? { status: 500, body: { message: 'oops' } }
        : { status: 201, body: { messageId: 'mid-4' } },
    );
    const res500 = await sendBrevoEmail({ ...base, marketing: true, fetchImpl: impl500 });
    expect(res500.sent).toBe(true);
    expect(calls500).toContain(SEND_URL);
  });

  it('never performs the lookup when marketing is false', async () => {
    const { impl, calls } = mockFetch(() => ({ status: 201, body: { messageId: 'mid-5' } }));
    const res = await sendBrevoEmail({ ...base, marketing: false, fetchImpl: impl });
    expect(res.sent).toBe(true);
    expect(calls).toEqual([SEND_URL]);
    expect(calls.some((c) => c.startsWith(CONTACT_PREFIX))).toBe(false);
  });
});
