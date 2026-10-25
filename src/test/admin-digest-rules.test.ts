import { describe, expect, it } from 'vitest';
import { visibleDigestAlerts, realCompletedApplications, candidateTextActivity } from '../../supabase/functions/_shared/admin-digest-rules';
describe('owner digest rules', () => {
  const candidates = [{ id:'jenifer', first_name:'Jenifer', last_name:'Whitney', phone:'+17865872765' }];
  const since = '2026-10-25T04:00:00Z', until = '2026-10-26T13:00:00Z';
  it('includes Monday morning sends before the 9 AM update with recipient names', () => {
    const rows = candidateTextActivity([{id:'send',phone:'7865872765',at:'2026-10-26T12:15:00Z',status:'sent',sid:'SM1'}],candidates,new Set(),since,until);
    expect(rows.map(r => [r.name,r.outcome,r.at])).toEqual([['Jenifer Whitney','sent','2026-10-26T12:15:00Z']]);
  });
  it('keeps queued and failed texts distinct from actual sends', () => {
    expect(candidateTextActivity([{id:'q',phone:'7865872765',at:since,status:'queued'},{id:'f',phone:'7865872765',at:since,status:'failed'}],candidates,new Set(),since,until).map(r => r.outcome)).toEqual(['queued','failed']);
  });
  it('excludes test candidates and deduplicates a queued-release send by SID', () => {
    const messages=[{id:'log',phone:'7865872765',at:since,status:'sent',sid:'SM1'},{id:'outbox',phone:'7865872765',at:since,status:'sent',sid:'SM1'}];
    expect(candidateTextActivity(messages,candidates,new Set(),since,until)).toHaveLength(1);
    expect(candidateTextActivity(messages,candidates,new Set(['jenifer']),since,until)).toEqual([]);
  });
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