// Owner-verified LinkedIn confirmation. The Zap's photo path never calls back
// the delivery receipt, so the owner confirms a post that is live on LinkedIn
// by pasting its link. The database function re-validates; this parser only
// gives the admin a fast, friendly check.

export type LinkedinConfirmation = { urn: string; url: string } | { error: string };

const URN = /^urn:li:(share|ugcPost|activity):\d+$/;

export function parseLinkedinConfirmation(input: string): LinkedinConfirmation | null {
  const value = input.trim();
  if (!value) return null;
  if (/^urn:li:/i.test(value)) {
    return URN.test(value) ? { error: 'Paste the post link (linkedin.com/feed/update/…), not just the URN' } : { error: 'That URN is not a valid LinkedIn post URN' };
  }
  if (!/^https:\/\//i.test(value)) return { error: 'Paste the full https://www.linkedin.com post link' };
  let url: URL;
  try { url = new URL(value); } catch { return { error: 'Paste the full https://www.linkedin.com post link' }; }
  if (!['linkedin.com', 'www.linkedin.com'].includes(url.hostname)) return { error: 'The link must be on linkedin.com' };
  const urn = url.pathname.match(/urn:li:(?:share|ugcPost|activity):\d+/)?.[0];
  if (!urn) return { error: 'Open the post on LinkedIn and copy the feed/update link (…/feed/update/urn:li:share/…)' };
  return { urn, url: value };
}
