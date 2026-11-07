import { describe, expect, it } from 'vitest';
import { approvedApplicationRecipient, APPROVED_APPLICANT } from '../../supabase/functions/_shared/approved-application-email';
describe('one owner-approved applicant email', () => {
  it('allows only Aleksandar at the approved address', () => {
    expect(approvedApplicationRecipient(APPROVED_APPLICANT, 'alekljustina@gmail.com')).toBe(true);
    expect(approvedApplicationRecipient(APPROVED_APPLICANT, 'jdlewis3923@gmail.com')).toBe(false);
    expect(approvedApplicationRecipient('another-applicant', 'alekljustina@gmail.com')).toBe(false);
  });
});