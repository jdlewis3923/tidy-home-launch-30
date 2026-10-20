import { describe, expect, it } from 'vitest';
import { visibleDigestAlerts, realCompletedApplications } from '../../supabase/functions/_shared/admin-digest-rules';
describe('owner digest rules', () => {
  it('keeps one latest warning for the same incident', () => {
    const rows = [{ alert_type: 'cron_snapshot_failed', title: 'Watchdog', dedupe_key: 'watchdog', id: 'latest' }, { alert_type: 'cron_snapshot_failed', title: 'Watchdog', dedupe_key: 'watchdog', id: 'old' }];
    expect(visibleDigestAlerts(rows, new Set()).map((r) => r.id)).toEqual(['latest']);
  });
  it('excludes test document events and test pro links', () => {
    expect(visibleDigestAlerts([
      { alert_type: 'documenso_envelope_signed', title: 'Signed', context: { document_id: 'test-doc-123' } },
      { alert_type: 'insurance_lapsed', title: 'Insurance lapsed', action_url: '/admin/pipeline/11111111-1111-4111-8111-111111111111' },
    ], new Set(['11111111-1111-4111-8111-111111111111']))).toEqual([]);
  });
  it('excludes cleared alerts', () => {
    expect(visibleDigestAlerts([{ alert_type: 'cron_snapshot_failed', title: 'Watchdog', resolved_at: '2026-10-20T01:00:00Z' }], new Set())).toEqual([]);
  });
  it('excludes test messages and test candidates', () => {
    expect(visibleDigestAlerts([
      { alert_type: 'admin_email', title: '[TEST] Email' },
      { alert_type: 'hiring_needs_help', title: 'Candidate needs help', context: { applicant_id: 'test' } },
      { alert_type: 'application_completed', title: 'Andy completed' },
    ], new Set(['test']))).toEqual([{ alert_type: 'application_completed', title: 'Andy completed' }]);
  });
  it('includes real submissions but not unfinished or test applications', () => {
    const rows = [
      { id: 'andy', apply_submitted_at: '2026-10-19T21:07:24Z', is_test: false, archived: false },
      { id: 'orestes', apply_submitted_at: null, is_test: false },
      { id: 'test', apply_submitted_at: '2026-10-19T21:00:00Z', is_test: true },
    ];
    expect(realCompletedApplications(rows, new Set(), (r) => r.id).map((r) => r.id)).toEqual(['andy']);
  });
});