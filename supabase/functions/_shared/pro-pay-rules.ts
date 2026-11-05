// Tidy — Pro pay canon (Connecteam era). Pure functions, no I/O, cents.
// Pay never varies by cadence.

export type Service = 'cleaning' | 'lawn' | 'detailing' | string;
export type VisitKind = 'standard' | 'maintenance' | 'full_detail' | 'deep_clean' | string;
export type Outcome = null | 'lockout' | 'late_cancel' | 'redo';

const CLEAN: Record<number, number> = { 1: 5600, 2: 7600, 3: 11200, 4: 17000, 5: 23800 };
const LAWN: Record<number, number> = { 1: 1800, 2: 2600, 3: 4000 };
const WASH: Record<number, number> = { 1: 1600, 2: 2000, 3: 2600 };
const DETAIL: Record<number, number> = { 1: 7800, 2: 8800, 3: 11500 };

export const ADDON_SHARE = 0.4;
export const TIER2_UPLIFT = 0.1;
export const REVIEW_BONUS_CENTS = 2500;
export const INSURANCE_MONTHLY_CENTS = 5000;
export const INSURANCE_MONTHS = 3;
export const REDO_WINDOW_DAYS = 60;

/** Whole-visit (team) base pay. Estate / Estate Plus first visit is 1.5×. */
export function teamBaseCents(service: Service, size: number, kind: VisitKind, firstEstate = false): number {
  const s = Math.max(1, Math.min(size || 1, service === 'cleaning' ? 5 : 3));
  if (service === 'cleaning') {
    const base = CLEAN[s];
    return s >= 4 && firstEstate ? Math.round(base * 1.5) : base;
  }
  if (service === 'lawn') return LAWN[s];
  if (service === 'detailing') return kind === 'full_detail' ? DETAIL[s] : WASH[s];
  return 0;
}

/** Each team member's share (split evenly; remainder cents to the first member). */
export function splitTeam(cents: number, members: number): number[] {
  const n = Math.max(1, members);
  const each = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => each + (i === 0 ? cents - each * n : 0));
}

export function addonCents(memberPriceCents: number): number {
  return Math.round(Math.max(0, memberPriceCents) * ADDON_SHARE);
}

/** Lockout / late cancel / redo pay 50% of the visit rate. A redo is $0 when
 *  the member already had a paid redo in the last 60 days. */
export function outcomeCents(base: number, outcome: Outcome, paidRedoInWindow = false): number {
  if (outcome === 'lockout' || outcome === 'late_cancel') return Math.round(base * 0.5);
  if (outcome === 'redo') return paidRedoInWindow ? 0 : Math.round(base * 0.5);
  return base;
}

export function tier2Qualifies(completedVisits: number, avgRating: number | null, daysWithTidy: number): boolean {
  return completedVisits >= 50 && (avgRating ?? 0) >= 4.8 && daysWithTidy >= 60;
}

export function tier2UpliftCents(visitAndAddonCents: number): number {
  return Math.round(visitAndAddonCents * TIER2_UPLIFT);
}

/** Months (YYYY-MM) that earn the $50 insurance reimbursement: the verification month and the next two. */
export function insuranceMonths(coiVerifiedAt: Date): string[] {
  return Array.from({ length: INSURANCE_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(coiVerifiedAt.getUTCFullYear(), coiVerifiedAt.getUTCMonth() + i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Monday (YYYY-MM-DD) of the pay week containing `d` in Miami time, and the Friday it is paid (the following Friday). */
export function payWeek(d: Date): { week_start: string; week_end: string; payout_friday: string } {
  const local = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const monday = new Date(day); monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const friday = new Date(monday); friday.setUTCDate(monday.getUTCDate() + 11);
  const f = (x: Date) => x.toISOString().slice(0, 10);
  return { week_start: f(monday), week_end: f(sunday), payout_friday: f(friday) };
}

// ---------- review matching ----------
function lev(a: string, b: string): number {
  const m = a.length, n = b.length; const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
const words = (s: string) => (s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]+/g) ?? []);

/** 'exact' when the Pro's first name appears as a word, 'fuzzy' when a word is one letter off, else 'none'. */
export function proNameMatch(reviewText: string, proFirstName: string): 'exact' | 'fuzzy' | 'none' {
  const name = words(proFirstName)[0]; if (!name) return 'none';
  const ws = words(reviewText);
  if (ws.includes(name)) return 'exact';
  if (name.length >= 4 && ws.some((w) => Math.abs(w.length - name.length) <= 1 && lev(w, name) === 1)) return 'fuzzy';
  return 'none';
}

/** Reviewer vs member full name: 'exact' when first+last match, 'fuzzy' when only first name (or one letter off), else 'none'. */
export function memberNameMatch(reviewerName: string, first: string, last: string): 'exact' | 'fuzzy' | 'none' {
  const r = words(reviewerName); const f = words(first)[0]; const l = words(last).slice(-1)[0];
  if (!f || !r.length) return 'none';
  if (r[0] === f && l && r.includes(l)) return 'exact';
  if (r[0] === f || (l && r.includes(l) && lev(r[0], f) <= 1)) return 'fuzzy';
  return 'none';
}

/** Auto only when both names match exactly; anything fuzzy goes to the owner's approval queue. */
export function reviewDecision(stars: number, pro: 'exact' | 'fuzzy' | 'none', member: 'exact' | 'fuzzy' | 'none', memberAlreadyPaid: boolean): 'auto' | 'pending' | 'ineligible' {
  if (stars !== 5 || pro === 'none' || member === 'none' || memberAlreadyPaid) return 'ineligible';
  return pro === 'exact' && member === 'exact' ? 'auto' : 'pending';
}
