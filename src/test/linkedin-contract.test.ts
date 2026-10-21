import { describe, expect, it } from 'vitest';
import { linkedinPayload, linkedinReceiptValid, linkedinNeedsConfirmation } from '../../supabase/functions/_shared/linkedin-contract';
describe('LinkedIn Zap contract', () => {
  it('photo sends exactly the four fields with full caption', () => expect(linkedinPayload('Full text\n#Tidy', 'calendar-id', 'https://example.com/callback', 'https://example.com/finished.jpg')).toEqual({caption:'Full text\n#Tidy', post_id:'calendar-id', callback_url:'https://example.com/callback', image_url:'https://example.com/finished.jpg'}));
  it('text omits image_url entirely', () => expect(Object.keys(linkedinPayload('Text #Tidy', 'id', 'https://example.com/callback'))).toEqual(['caption','callback_url','post_id']));
  it('times out at ten minutes, not before', () => { expect(linkedinNeedsConfirmation(0,599999)).toBe(false); expect(linkedinNeedsConfirmation(0,600000)).toBe(true); });
  it('never times out a post with a URN', () => expect(linkedinNeedsConfirmation(0,999999,'urn:li:share:123')).toBe(false));
  it('validates LinkedIn receipts', () => { expect(linkedinReceiptValid('urn:li:share:123','https://www.linkedin.com/feed/update/urn:li:share:123/')).toBe(true); expect(linkedinReceiptValid('urn:li:share:123','https://evil.example/posts/123')).toBe(false); });
});