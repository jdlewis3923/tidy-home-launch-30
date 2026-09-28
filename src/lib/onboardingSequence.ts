/**
 * Tidy onboarding sequence — the single definition of stages, gates and the
 * email inventory. Pure (no imports) so the admin UI and the server share it.
 *
 * MIRRORED byte-for-byte at src/lib/onboardingSequence.ts (parity test).
 * Edit both together.
 */

export const SEQUENCE_STAGES = [
  'applied', 'screening', 'interview_booked', 'waiting', 'contract_sent',
  'signed', 'photo_approved', 'kit_ordered', 'all_set', 'active',
] as const;
export const SEQUENCE_EXITS = ['declined', 'cold', 'hold'] as const;
export type SequenceStage = (typeof SEQUENCE_STAGES)[number] | (typeof SEQUENCE_EXITS)[number];

export const STAGE_INFO: Record<SequenceStage, { label: string; waitingOn: 'you' | 'them' | 'auto' | 'none' }> = {
  applied: { label: 'Applied', waitingOn: 'you' },
  screening: { label: 'Screening', waitingOn: 'you' },
  interview_booked: { label: 'Interview booked', waitingOn: 'you' },
  waiting: { label: 'Waiting on them', waitingOn: 'them' },
  contract_sent: { label: 'Contract sent', waitingOn: 'them' },
  signed: { label: 'Signed — badge photo', waitingOn: 'them' },
  photo_approved: { label: 'Photo approved', waitingOn: 'you' },
  kit_ordered: { label: 'Kit ordered', waitingOn: 'auto' },
  all_set: { label: 'All set', waitingOn: 'you' },
  active: { label: 'Active', waitingOn: 'none' },
  declined: { label: 'Declined', waitingOn: 'none' },
  cold: { label: 'Cold', waitingOn: 'none' },
  hold: { label: 'On hold', waitingOn: 'you' },
};

/** The one next move per stage. `null` = nothing for you to press. */
export type NextAction =
  | 'start_screening' | 'book_interview' | 'send_onboarding' | 'send_contract'
  | 'review_photo' | 'kit_ordered' | 'mark_active' | 'resume';
export const NEXT_ACTION: Record<SequenceStage, { action: NextAction; label: string; gate: GateKey | null } | null> = {
  applied: { action: 'start_screening', label: 'Start screening', gate: null },
  screening: { action: 'book_interview', label: 'Book interview', gate: 'interview' },
  interview_booked: { action: 'send_onboarding', label: 'Advance → send onboarding', gate: 'A' },
  waiting: { action: 'send_contract', label: 'Send contract', gate: 'B' },
  contract_sent: null,
  signed: { action: 'review_photo', label: 'Review badge photo', gate: null },
  photo_approved: { action: 'kit_ordered', label: 'Kit ordered', gate: null },
  kit_ordered: null,
  all_set: { action: 'mark_active', label: 'Mark active', gate: 'D' },
  active: null,
  declined: null,
  cold: { action: 'resume', label: 'Move back to screening', gate: null },
  hold: { action: 'resume', label: 'Move back to screening', gate: null },
};

// ------------------------------------------------------------------- gates
export type GateKey = 'interview' | 'A' | 'B' | 'C' | 'D';

export type GateFacts = {
  email?: string | null;
  phone?: string | null;
  service?: string | null;
  bilingual_gate?: unknown;
  work_authorized?: unknown;
  drivers_license?: unknown;
  own_equipment?: unknown;
  drive_minutes?: number | null;
  gate_confirmations?: Record<string, unknown> | null;
  bg_check_status?: string | null;
  coi_review_status?: string | null;
  coi_carrier_name?: string | null;
  coi_policy_number?: string | null;
  coi_expires_at?: string | null;
  contracts_signed?: boolean | null;
  kit_status?: string | null;
  badge_photo_status?: string | null;
  expected_delivery_date?: string | null;
};

const yes = (v: unknown) => v === true || v === 'yes' || v === 'true';
const conf = (f: GateFacts, k: string) => yes((f.gate_confirmations ?? {})[k]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneOk = (p?: string | null) => !!p && p.replace(/\D/g, '').length >= 10;
const emailOk = (e?: string | null) => !!e && EMAIL_RE.test(e);
const INTAKE_DONE = ['submitted', 'kit_ordered', 'kit_issued'];

export const bgClear = (f: GateFacts) => f.bg_check_status === 'clear';
export const coiVerified = (f: GateFacts, now = Date.now()) =>
  ['approved', 'verified'].includes(String(f.coi_review_status ?? '')) &&
  !!f.coi_carrier_name && !!f.coi_policy_number && conf(f, 'coi_limits_ok') &&
  !!f.coi_expires_at && new Date(f.coi_expires_at).getTime() > now + 60 * 86_400_000;
export const intakeIn = (f: GateFacts) => INTAKE_DONE.includes(String(f.kit_status ?? ''));
export const photoApproved = (f: GateFacts) => f.badge_photo_status === 'approved';

/** Returns the list of missing items; empty list = gate open. */
export function gateMissing(gate: GateKey, f: GateFacts, now = Date.now()): string[] {
  const m: string[] = [];
  if (gate === 'interview') {
    if (!phoneOk(f.phone)) m.push('phone');
    if (!emailOk(f.email)) m.push('email');
  }
  if (gate === 'A') {
    if (!phoneOk(f.phone)) m.push('valid phone');
    if (!emailOk(f.email)) m.push('valid email');
    if (!yes(f.bilingual_gate)) m.push('bilingual');
    if (!yes(f.work_authorized)) m.push('work authorization');
    if (!yes(f.drivers_license)) m.push("driver's license");
    if (!yes(f.own_equipment)) m.push('own equipment');
    if (!conf(f, 'bg_consent')) m.push('background-check consent');
    if (f.drive_minutes == null) m.push('drive time');
    else if (f.drive_minutes > 20) m.push('drive time over 20 min');
    if (!conf(f, 'pay_reviewed')) m.push('pay reviewed');
    if (!f.service) m.push('service');
  }
  if (gate === 'B') {
    if (!bgClear(f)) m.push('background check clear');
    if (!coiVerified(f, now)) m.push('certificate verified (carrier, policy, $1M/$2M, 60+ days)');
    if (!intakeIn(f)) m.push('intake submitted');
  }
  if (gate === 'C') {
    if (!bgClear(f)) m.push('background check');
    if (!coiVerified(f, now)) m.push('certificate');
    if (!f.contracts_signed) m.push('agreement signed');
    if (!intakeIn(f)) m.push('intake');
    if (!photoApproved(f)) m.push('photo approved');
    if (!f.expected_delivery_date) m.push('kit date');
  }
  if (gate === 'D') {
    if (!conf(f, 'kit_delivered')) m.push('kit delivered');
    if (!conf(f, 'route_assigned')) m.push('route assigned');
  }
  return m;
}

/** Ticks the admin records on the card (facts the system can't observe). */
export const CONFIRMATION_TICKS = [
  { key: 'bg_consent', label: 'Background-check consent given', gate: 'A' },
  { key: 'pay_reviewed', label: 'Pay reviewed on the call', gate: 'A' },
  { key: 'coi_limits_ok', label: 'Certificate limits $1M / $2M checked', gate: 'B' },
  { key: 'kit_delivered', label: 'Kit delivered', gate: 'D' },
  { key: 'route_assigned', label: 'First route assigned', gate: 'D' },
] as const;

// ---------------------------------------------------------- email inventory
/**
 * Every email the sequence can send. `after` = the email that must have sent
 * first. `repeat` = how many times it may send (default 1). `auto` = sent by
 * the system (subject to the 48-hour cap and quiet hours).
 */
export const SEQUENCE_EMAILS: Record<string, { order: string; after: string | null; repeat?: number; auto: boolean; label: string }> = {
  application_received: { order: '1', after: null, auto: true, label: 'Application received' },
  interview_confirmed: { order: '2', after: null, repeat: 5, auto: false, label: 'Interview confirmed' },
  interview_reminder: { order: '2r', after: 'interview_confirmed', repeat: 5, auto: true, label: 'Interview reminder' },
  decline: { order: '—', after: null, auto: false, label: 'Not moving forward' },
  onboarding: { order: '3', after: null, auto: false, label: 'Onboarding — everything you need' },
  missing: { order: '3c', after: 'onboarding', repeat: 2, auto: true, label: "What's still missing" },
  contract: { order: '4', after: 'onboarding', auto: false, label: 'Sign your agreement' },
  badge_photo: { order: '5', after: 'contract', auto: true, label: 'Badge photo' },
  photo_retake: { order: '5r', after: 'badge_photo', repeat: 3, auto: false, label: 'Take another photo' },
  all_set: { order: '6', after: 'badge_photo', auto: true, label: "You're all set + Pro number" },
  first_route: { order: '7', after: 'all_set', auto: false, label: 'Your first route' },
};

/** Quiet hours for automated email: 8:00 AM–8:00 PM Eastern. */
export function easternHour(d: Date): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(d);
  return Number(h);
}
export function inQuietHours(d: Date): boolean {
  const h = easternHour(d);
  return h < 8 || h >= 20;
}
/** Next moment automated mail may go out (top of the next allowed hour). */
export function nextSendWindow(d: Date): Date {
  const t = new Date(d.getTime());
  for (let i = 0; i < 48 && inQuietHours(t); i++) {
    t.setUTCMinutes(0, 0, 0);
    t.setUTCHours(t.getUTCHours() + 1);
  }
  return t;
}
export const AUTO_CAP_MS = 48 * 3_600_000;
