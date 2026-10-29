import { CLEANING_BASE_PAY, type CleaningSize } from './pricing-canon';
import { redoPayCents } from './redo-pay';

export const CLEANING_ROTATION = ['baseboards', 'blinds', 'fans_fixtures', 'cabinet_fronts', 'vents'] as const;
export function cleaningTeamCanClose(paired: boolean, leadCheckedOut: boolean, partnerCheckedOut: boolean, inspectionSaved: boolean, zonesSaved: boolean) {
  return inspectionSaved && zonesSaved && (!paired || (leadCheckedOut && partnerCheckedOut));
}
export function cleaningPayBreakdown(size: CleaningSize, firstVisit: boolean, paired: boolean, outcome: 'complete' | 'redo' | 'lockout' | 'late_cancel' | 'unsafe' = 'complete', addonCents = 0, together = false, lastPaidRedoAt:Date|null=null, completedAt=new Date()) {
  const base = CLEANING_BASE_PAY[size] * 100;
  const firstPremium = size >= 4 && firstVisit && outcome === 'complete' ? base / 2 : 0;
  const partial = outcome === 'redo' ? redoPayCents(base,lastPaidRedoAt,completedAt)/base : outcome === 'complete' ? 1 : 0.5;
  const total = (base + firstPremium) * partial;
  const split = paired && size === 5 ? 2 : 1;
  return { base: base / split, firstPremium: firstPremium / split, adjustment: outcome === 'complete' ? 0 : -(base*(1-partial))/split, visitPay: total / split, addonPay: Math.round(addonCents * 0.4) / (together && paired ? 2 : 1) };
}
export function cleaningRescheduleRule(noticeHours: number, skipsUsed: number, skip: boolean) {
  if (noticeHours < 24) return 'used';
  if (noticeHours < 48) return skip ? 'skip_not_available' : 'same_week';
  if (skip) return skipsUsed >= 2 ? 'skip_limit' : 'credit';
  return 'within_7_days';
}
export function rotatingCleaningTask(completedVisits: number) {
  return CLEANING_ROTATION[Math.max(0, completedVisits) % CLEANING_ROTATION.length];
}