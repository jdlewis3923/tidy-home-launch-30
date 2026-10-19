export const SOCIAL_LATE_WINDOW_MS = 5 * 60 * 1000;
export const SOCIAL_REPEAT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
export type SocialSnapshot = { id: string; platform: string; scheduled_for: string; caption: string; content_hash: string; image_url: string; image_hash: string; platform_post_id?: string | null; posted_at?: string | null };
export function socialBlockReason(post: SocialSnapshot, history: SocialSnapshot[], now: number): string | null {
  if (post.platform_post_id || post.posted_at) return 'already_confirmed';
  if (!post.image_url || !post.image_hash) return 'missing_image';
  const due = Date.parse(post.scheduled_for);
  if (due > now) return 'not_due';
  if (now - due > SOCIAL_LATE_WINDOW_MS) return 'missed';
  const same = history.filter(h => h.platform === post.platform && h.id !== post.id);
  if (same.some(h => h.scheduled_for === post.scheduled_for)) return 'slot_already_used';
  if (same.some(h => now - Date.parse(h.posted_at ?? h.scheduled_for) <= SOCIAL_REPEAT_WINDOW_MS && (h.content_hash === post.content_hash || h.image_hash === post.image_hash))) return 'repeat_within_90_days';
  return null;
}
export async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}