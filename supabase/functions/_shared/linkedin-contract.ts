export const LINKEDIN_CONFIRMATION_TIMEOUT_MS = 10 * 60 * 1000;
export function linkedinPayload(caption: string, postId: string, callbackUrl: string, imageUrl?: string) {
  return { caption, ...(imageUrl ? { image_url: imageUrl } : {}), callback_url: callbackUrl, post_id: postId };
}
export function linkedinReceiptValid(urn: string, url: string): boolean {
  try {
    const link = new URL(url);
    return /^urn:li:(share|ugcPost|activity):\d+$/.test(urn) && link.protocol === 'https:' && ['linkedin.com', 'www.linkedin.com'].includes(link.hostname) && /^\/(feed\/update\/urn:li:|posts\/)/.test(link.pathname);
  } catch { return false; }
}
export function linkedinNeedsConfirmation(createdAt: number, now: number, urn?: string | null) {
  return !urn && now - createdAt >= LINKEDIN_CONFIRMATION_TIMEOUT_MS;
}