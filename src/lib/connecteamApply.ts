export type ApplyService = 'cleaning' | 'lawn' | 'car';

export const CONNECTEAM_APPLY: Record<ApplyService, string> = {
  cleaning: 'https://app.connecteam.com/#/apply?link=950932e9-a9c3-4160-bbc9-bd0a1ae4d1ab',
  lawn: 'https://app.connecteam.com/#/apply?link=7fd96f05-4ce2-4179-b162-be193866b2af',
  car: 'https://app.connecteam.com/#/apply?link=57cecc27-b3e7-447f-a427-726a5e4404a6',
};

/** Connecteam's application query lives inside the hash, not the outer URL. */
export function connecteamApplyUrl(service: ApplyService, src?: string | null): string {
  const base = CONNECTEAM_APPLY[service];
  return src ? `${base}&${new URLSearchParams({ src }).toString()}` : base;
}

/** Maps legacy service words (from old /apply links) to a Connecteam form. */
export function applyServiceFrom(raw: string | null | undefined): ApplyService | null {
  const s = (raw ?? '').toLowerCase();
  if (!s) return null;
  if (/clean|house|home|limpieza/.test(s)) return 'cleaning';
  if (/lawn|yard|grass|cesped|césped|jardin/.test(s)) return 'lawn';
  if (/car|vehicle|wash|detail|auto/.test(s)) return 'car';
  return null;
}
