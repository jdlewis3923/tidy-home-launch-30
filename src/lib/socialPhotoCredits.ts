export type SocialPhotoCredit = {
  date: string;
  time_et: string;
  photographer: string;
  photo_page: string;
};

const marker = 'LinkedIn photo credit: ';

export function socialPhotoCredit(notes: string | null | undefined): SocialPhotoCredit | null {
  const line = notes?.split('\n').find(value => value.startsWith(marker));
  if (!line) return null;
  try {
    const credit: unknown = JSON.parse(line.slice(marker.length));
    if (!credit || typeof credit !== 'object') return null;
    const value = credit as Record<string, unknown>;
    if (typeof value.date !== 'string' || typeof value.time_et !== 'string' ||
        typeof value.photographer !== 'string' || typeof value.photo_page !== 'string') return null;
    const page = new URL(value.photo_page);
    if (page.protocol !== 'https:' || !['www.pexels.com', 'pexels.com', 'unsplash.com'].includes(page.hostname)) return null;
    return { date: value.date, time_et: value.time_et, photographer: value.photographer, photo_page: value.photo_page };
  } catch {
    return null;
  }
}