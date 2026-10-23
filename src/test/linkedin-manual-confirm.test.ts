import { describe, expect, it } from 'vitest';
import { parseLinkedinConfirmation } from '@/lib/linkedinConfirm';

describe('Owner-pasted LinkedIn confirmation link', () => {
  it('reads the URN from a feed/update link', () => {
    expect(parseLinkedinConfirmation('https://www.linkedin.com/feed/update/urn:li:share:7518474104555945984/')).toEqual({ urn: 'urn:li:share:7518474104555945984', url: 'https://www.linkedin.com/feed/update/urn:li:share:7518474104555945984/' });
  });
  it('accepts ugcPost and activity URNs', () => {
    expect(parseLinkedinConfirmation('https://www.linkedin.com/feed/update/urn:li:ugcPost:123/') && parseLinkedinConfirmation('https://linkedin.com/feed/update/urn:li:activity:9/')).toEqual({ urn: 'urn:li:activity:9', url: 'https://linkedin.com/feed/update/urn:li:activity:9/' });
  });
  it('rejects a bare URN and asks for the link', () => {
    expect(parseLinkedinConfirmation('urn:li:share:123')).toEqual({ error: 'Paste the post link (linkedin.com/feed/update/…), not just the URN' });
  });
  it('rejects links off linkedin.com or non-https links', () => {
    expect(parseLinkedinConfirmation('https://evil.example/posts/123')?.error).toContain('linkedin.com');
    expect(parseLinkedinConfirmation('http://www.linkedin.com/feed/update/urn:li:share:123/')?.error).toContain('https://');
  });
  it('rejects a linkedin.com link without a post URN', () => {
    expect(parseLinkedinConfirmation('https://www.linkedin.com/company/tidy-home/')).toEqual({ error: 'Open the post on LinkedIn and copy the feed/update link (…/feed/update/urn:li:share/…)' });
  });
});
