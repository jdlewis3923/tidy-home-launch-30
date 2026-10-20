// Prepaid Year math (all amounts in cents). Yearly = 12 × monthly × 0.90.
// Cancel: started months count as used, charged at the member's monthly rate; the rest is refunded.
export const PREPAID_DISCOUNT = 0.1;
export const RENEWAL_NOTICE_DAYS = 45;

export function yearlyPriceCents(monthlyCents: number): number {
  return Math.round(monthlyCents * 12 * (1 - PREPAID_DISCOUNT));
}

export function monthsUsed(startIso: string, cancelIso: string): number {
  const s = new Date(startIso), c = new Date(cancelIso);
  let m = (c.getUTCFullYear() - s.getUTCFullYear()) * 12 + (c.getUTCMonth() - s.getUTCMonth());
  if (c.getUTCDate() > s.getUTCDate() || (c.getUTCDate() === s.getUTCDate() && c.getTime() > s.getTime() && m === 0)) m += 1;
  return Math.min(12, Math.max(1, m));
}

export function cancelRefundCents(monthlyCents: number, paidCents: number, used: number) {
  const charged = Math.min(paidCents, monthlyCents * Math.min(12, Math.max(0, used)));
  return { charged, refund: paidCents - charged };
}

export function renewalNoticeDate(renewIso: string): string {
  const d = new Date(renewIso);
  d.setUTCDate(d.getUTCDate() - RENEWAL_NOTICE_DAYS);
  return d.toISOString().slice(0, 10);
}
