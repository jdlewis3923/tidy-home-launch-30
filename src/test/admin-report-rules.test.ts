import { describe, it, expect } from 'vitest';
import { candidateSource, candidateStatusLine, candidateSubmission, visibleCandidate } from '../lib/admin-report-rules';
import { monthsElapsed } from '../../supabase/functions/_shared/kpi-engine';
describe('truthful admin reports', () => {
  it('Indeed recruitment does not establish Tidy submission', () => expect(candidateSubmission({ source: 'indeed' })).toBe('Not submitted on Tidy'));
  it('a submitted Indeed candidate retains recruitment source', () => {
    expect(candidateSource('indeed')).toBe('Indeed');
    expect(candidateSubmission({ source: 'indeed', apply_submitted_at: '2026-10-19T21:07:24Z' })).toBe('Submitted on Tidy');
  });
  it('excludes archived candidates', () => expect(visibleCandidate({ archived: true, applicants: { first_name: 'Fernando' } })).toBe(false));
  it('excludes pipeline test candidates', () => expect(visibleCandidate({ is_test: true, applicants: { first_name: 'Test' } })).toBe(false));
  it('excludes applicant test candidates', () => expect(visibleCandidate({ applicants: { first_name: 'Justin', is_test_row: true } })).toBe(false));
  it('includes real submitted candidates', () => expect(visibleCandidate({ applicants: { first_name: 'Andy' } })).toBe(true));
  it('starts operating elapsed time November 23, not May', () => expect(monthsElapsed('2026-11-23', Date.parse('2026-10-21T01:27:00Z'))).toBe(0));
  it('Indeed candidate who finished on Tidy says both', () => expect(candidateStatusLine({ source: 'indeed', apply_submitted_at: '2026-10-19T21:07:24Z' })).toBe('Found on Indeed · Finished the Tidy application on jointidy.co Oct 19, 5:07 PM ET'));
  it('Indeed candidate who never finished says not filled out', () => expect(candidateStatusLine({ source: 'indeed' })).toBe('Found on Indeed · Has NOT filled out the Tidy application yet'));
  it('website candidate falls back to applicant source', () => expect(candidateStatusLine({ applicants: { source: 'apply_form' }, apply_submitted_at: '2026-10-12T14:54:05Z' })).toBe('Found on Tidy website · Finished the Tidy application on jointidy.co Oct 12, 10:54 AM ET'));
});