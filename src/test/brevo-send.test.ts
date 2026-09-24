import { describe, it, expect, vi } from 'vitest';
// Deno-style specifier resolves fine under vitest since the helper is plain TS.
import { sendBrevoEmail } from '../../supabase/functions/_shared/brevo-send';
import { brandHostedTemplate } from '../../supabase/functions/_shared/email-brand';

const SEND_URL = 'https://connector-gateway.lovable.dev/brevo/smtp/email';
const CONTACT_PREFIX = 'https://connector-gateway.lovable.dev/brevo/contacts/';
const TEMPLATE_PREFIX = 'https://connector-gateway.lovable.dev/brevo/smtp/templates/';
const OFFICIAL_LOGO = 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/storage/v1/object/public/social-images/brand%2Ftidy-logo-email.png';
const COMPLIANT_TEMPLATE = `<!doctype html><html data-tidy-email="branded"><body><img src="${OFFICIAL_LOGO}"><table><tr data-tidy-service-strip="true"><td>Services</td></tr><tr data-tidy-hero-photo="true"><td><img src="x"></td></tr></table></body></html>`;

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body?: unknown } | Error) {
  const calls: string[] = [];
  const impl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith(TEMPLATE_PREFIX)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ subject: 'Test', htmlContent: COMPLIANT_TEMPLATE }),
        text: async () => JSON.stringify({ subject: 'Test', htmlContent: COMPLIANT_TEMPLATE }),
        headers: new Headers(),
      } as unknown as Response;
    }
    const out = handler(u, init);
    if (out instanceof Error) throw out;
    return {
      ok: out.status >= 200 && out.status < 300,
      status: out.status,
      json: async () => out.body ?? {},
      text: async () => JSON.stringify(out.body ?? {}),
      headers: new Headers(),
    } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const base = {
  to: 'person@example.com',
  templateId: 42,
  params: { first_name: 'Jane' },
  apiKey: 'test-key',
  lovableApiKey: 'test-lovable-key',
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
    expect(calls).toEqual([TEMPLATE_PREFIX + '42', SEND_URL]);
    expect(calls.some((c) => c.startsWith(CONTACT_PREFIX))).toBe(false);
  });
});

describe('sendBrevoEmail Tidy branding enforcement', () => {
  it('wraps every code-generated HTML email in the shared Tidy design', async () => {
    let payload: Record<string, unknown> = {};
    const { impl } = mockFetch((_url, init) => {
      payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return { status: 201, body: { messageId: 'branded-1' } };
    });
    await sendBrevoEmail({
      to: 'person@example.com',
      subject: 'A Tidy update',
      htmlContent: '<p>Plain content</p>',
      marketing: false,
      apiKey: 'test-key',
      lovableApiKey: 'test-lovable-key',
      fetchImpl: impl,
    });
    const html = String(payload.htmlContent ?? '');
    expect(html).toContain('data-tidy-email="branded"');
    expect(html).toContain(OFFICIAL_LOGO);
    expect(html).toContain('Cleaning');
    expect(html).toContain('Lawn');
    expect(html).toContain('Car Care');
    expect(html).toContain('2121 Biscayne Blvd #1562');
    expect(html).toContain('<p>Plain content</p>');
    // Light mode only: no dark panels anywhere.
    expect(html).not.toMatch(/background(?:-color)?\s*:\s*#0f172a/i);
    expect(html).not.toMatch(/bgcolor\s*=\s*"#0f172a"/i);
    expect(html).toContain('data-tidy-hero-photo="true"');
  });

  it('lightens dark panels inside the caller HTML and keeps a hero focal point', async () => {
    let payload: Record<string, unknown> = {};
    const { impl } = mockFetch((_url, init) => {
      payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return { status: 201, body: { messageId: 'branded-3' } };
    });
    await sendBrevoEmail({
      to: 'person@example.com',
      subject: 'Your visit is confirmed',
      htmlContent: '<div style="background:#0f172a"><p style="color:#ffffff">Dark block</p></div>',
      marketing: false,
      apiKey: 'test-key',
      lovableApiKey: 'test-lovable-key',
      fetchImpl: impl,
    });
    const html = String(payload.htmlContent ?? '');
    expect(html).not.toMatch(/background\s*:\s*#0f172a/i);
    expect(html).not.toMatch(/color\s*:\s*#ffffff/i);
    expect(html).toContain('data-tidy-hero-photo="true"');
    expect(html).toContain('🗓️');
  });

  it('does not nest an already branded email', async () => {
    let payload: Record<string, unknown> = {};
    const { impl } = mockFetch((_url, init) => {
      payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return { status: 201, body: { messageId: 'branded-2' } };
    });
    const branded = '<!doctype html><html data-tidy-email="branded"><body>Ready</body></html>';
    await sendBrevoEmail({
      to: 'person@example.com', htmlContent: branded, marketing: false,
      apiKey: 'test-key', lovableApiKey: 'test-lovable-key', fetchImpl: impl,
    });
    expect(payload.htmlContent).not.toBe(branded);
    expect(String(payload.htmlContent)).toContain(OFFICIAL_LOGO);
    expect(String(payload.htmlContent)).toContain('data-tidy-hero-photo="true"');
  });
});

describe('hosted Tidy template branding', () => {
  it('upgrades the logo and inserts the white service strip without losing merge fields', () => {
    const source = '<!doctype html><html><body><table><!-- Brand bar --><tr><td style="background:#0f172a"><img src="https://raw.githubusercontent.com/jdlewis3923/tidy-home-launch-30/main/tidy-logo-circle.png"></td></tr><!-- Hero banner --><tr><td>Hello {{ params.first_name }}</td></tr></table></body></html>';
    const result = brandHostedTemplate(source, 'Welcome');
    expect(result.changed).toBe(true);
    expect(result.html).toContain(OFFICIAL_LOGO);
    expect(result.html).toContain('data-tidy-service-strip="true"');
    expect(result.html).toContain('{{ params.first_name }}');
  });

  it('wraps a plain hosted template in the complete Tidy shell', () => {
    const result = brandHostedTemplate('<html><body><p>Hello {{ contact.FIRSTNAME }}</p></body></html>', 'Hello');
    expect(result.mode).toBe('wrapped');
    expect(result.html).toContain('data-tidy-email="branded"');
    expect(result.html).toContain('{{ contact.FIRSTNAME }}');
  });
});
