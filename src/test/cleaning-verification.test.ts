import { describe, it, expect } from 'vitest';
import { cleaningVerificationError, type CleaningVerification } from '../../supabase/functions/_shared/cleaning-gate';

const verified: CleaningVerification = { cleaning_verified_at: '2026-10-27T21:00:00Z', cleaning_verified_size: '4', cleaning_size_confirmation: 'not_needed', cleaning_team_ready: false };
describe('cleaning payment protections', () => {
  it('requires admin measurement before billing', () => {
    expect(cleaningVerificationError(null, 4)).toBe('cleaning_requires_verification');
  });
  it('requires explicit approval before an increase', () => {
    expect(cleaningVerificationError({ ...verified, cleaning_size_confirmation: 'pending' }, 4)).toBe('cleaning_size_confirmation_required');
    expect(cleaningVerificationError({ ...verified, cleaning_size_confirmation: 'confirmed' }, 4)).toBeNull();
  });
  it('refuses declined or missing confirmation', () => {
    for (const cleaning_size_confirmation of ['declined', null]) expect(cleaningVerificationError({ ...verified, cleaning_size_confirmation }, 4)).toBe('cleaning_size_confirmation_required');
  });
  it('cannot buy a different size from the verified home', () => {
    expect(cleaningVerificationError(verified, 2)).toBe('cleaning_size_confirmation_required');
  });
  it('Estate Plus cannot convert without a ready team', () => {
    const estate = { ...verified, cleaning_verified_size: '5' };
    expect(cleaningVerificationError(estate, 5)).toBe('cleaning_needs_team');
    expect(cleaningVerificationError({ ...estate, cleaning_team_ready: true }, 5)).toBeNull();
  });
  it('homes over the bands require a walkthrough', () => {
    expect(cleaningVerificationError({ ...verified, cleaning_verified_size: 'custom' }, 5)).toBe('cleaning_walkthrough_required');
  });
});