import { describe, expect, it } from 'vitest';
import { currentActionableAlerts, type ActionableAlert } from '@/lib/actionableAlerts';

let sequence = 0;
const alert = (alert_type: string, title: string, dedupe_key: string | null, created_at: string, extra: Partial<ActionableAlert> = {}): ActionableAlert => ({ id: String(++sequence), alert_type, title, dedupe_key, created_at, ...extra });

describe('currentActionableAlerts', () => {
  it('collapses 32 operations digests to the latest current summary', () => {
    const rows = Array.from({ length: 32 }, (_, i) => alert('ops_digest', `Digest ${i}`, `ops_digest:day:${i}`, new Date(Date.UTC(2026, 10, 1 + i)).toISOString()));
    const result = currentActionableAlerts(rows);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Digest 31');
  });

  it('collapses repeated sync and roadmap notifications by their stable source', () => {
    const rows = [
      alert('jobber_connecteam_sync', 'Jobber sync failed', 'sync:hour:1', '2026-11-20T01:00:00Z'),
      alert('jobber_connecteam_sync', 'Jobber sync failed', 'sync:hour:2', '2026-11-21T01:00:00Z'),
      alert('roadmap_urgent', 'Prepaid Year: 7 problems', 'roadmap:initiative-1:behind:20', '2026-11-20T01:00:00Z'),
      alert('roadmap_urgent', 'Prepaid Year: 7 problems', 'roadmap:initiative-1:behind:21', '2026-11-21T01:00:00Z'),
    ];
    expect(currentActionableAlerts(rows)).toHaveLength(2);
  });

  it('keeps separate Pro reviews and excludes snoozed items', () => {
    const rows = [
      alert('pro_profile_complete', 'Susan profile', 'pro-profile:susan', '2026-11-20T01:00:00Z'),
      alert('pro_profile_complete', 'Alek profile', 'pro-profile:alek', '2026-11-20T02:00:00Z'),
      alert('admin_text', 'Later', 'admin:text', '2026-11-20T03:00:00Z', { snoozed_until: '2026-11-22T03:00:00Z' }),
    ];
    expect(currentActionableAlerts(rows, Date.parse('2026-11-21T12:00:00Z')).map((row) => row.title)).toEqual(['Alek profile', 'Susan profile']);
  });
});
