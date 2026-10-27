// Prepaid Year math (all amounts in cents). Yearly = 12 × monthly × 0.90.
// Cancel: started months count as used, charged at the member's monthly rate; the rest is refunded.
export const PREPAID_DISCOUNT = 0.1;
export const RENEWAL_NOTICE_DAYS = 45;

export function yearlyPriceCents(monthlyCents: number): number {
  return Math.round(monthlyCents * 12 * (1 - PREPAID_DISCOUNT));
}

export function monthsUsed(startIso: string, cancelIso: string): number {
  const start = new Date(startIso), cancel = new Date(cancelIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(cancel.getTime())) throw new Error('invalid_term_date');
  if (cancel.getTime() <= start.getTime()) return 1;
  for (let month=1; month<=12; month++) {
    const boundary = new Date(start);
    boundary.setUTCDate(1);
    boundary.setUTCMonth(start.getUTCMonth()+month);
    const lastDay = new Date(Date.UTC(boundary.getUTCFullYear(),boundary.getUTCMonth()+1,0)).getUTCDate();
    boundary.setUTCDate(Math.min(start.getUTCDate(),lastDay));
    if (cancel.getTime() <= boundary.getTime()) return month;
  }
  return 12;
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
