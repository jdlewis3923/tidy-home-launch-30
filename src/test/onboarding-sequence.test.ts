import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gateMissing, inQuietHours, nextSendWindow, NEXT_ACTION, SEQUENCE_EMAILS, SEQUENCE_STAGES } from '@/lib/onboardingSequence';

describe('onboarding sequence', () => {
  it('client and server definitions are identical', () => {
    expect(readFileSync('src/lib/onboardingSequence.ts', 'utf8')).toBe(readFileSync('supabase/functions/_shared/onboarding-sequence.ts', 'utf8'));
  });
  it('every stage has at most one next action', () => {
    for (const s of SEQUENCE_STAGES) expect(NEXT_ACTION[s] === null || typeof NEXT_ACTION[s]!.action === 'string').toBe(true);
  });
  it('gate B lists what is missing and opens when true', () => {
    expect(gateMissing('B', {})).toHaveLength(3);
    const far = new Date(Date.now() + 90 * 86_400_000).toISOString();
    expect(gateMissing('B', { bg_check_status: 'clear', coi_review_status: 'approved', coi_carrier_name: 'X', coi_policy_number: '1', coi_expires_at: far, gate_confirmations: { coi_limits_ok: true }, kit_status: 'submitted' })).toEqual([]);
  });
  it('gate A rejects long drives', () => {
    expect(gateMissing('A', { drive_minutes: 35 })).toContain('drive time over 20 min');
  });
  it('quiet hours are 8 PM–8 AM Eastern', () => {
    expect(inQuietHours(new Date('2026-09-28T03:00:00Z'))).toBe(true); // 11 PM EDT
    expect(inQuietHours(new Date('2026-09-28T16:00:00Z'))).toBe(false); // noon EDT
    expect(nextSendWindow(new Date('2026-09-28T03:00:00Z')).toISOString()).toBe('2026-09-28T12:00:00.000Z');
  });
  it('every email after #3 needs the one before it', () => {
    expect(SEQUENCE_EMAILS.contract.after).toBe('onboarding');
    expect(SEQUENCE_EMAILS.all_set.after).toBe('badge_photo');
  });
});
