import { describe, it, expect } from 'vitest';
import { comingUp, dueDate, kickoffDue, kickoffText, launchDecision, milestoneLine, urgentReasons, type Initiative } from '../../supabase/functions/_shared/roadmap-rules';

const mk = (o: Partial<Initiative> = {}): Initiative => ({
  id: 'a', name: 'Prepaid Year', launch_date: '2026-11-16', status: 'building', switch_on: false, gate_passed: false,
  gate_description: 'Tests pass', build_prompt: null, is_template: false, kickoff_sent_at: null,
  items: [{ id: '1', task: 'Report visits', owner: 'Lovable', lead_days: 25, done: false }, { id: '2', task: 'Test', owner: 'Lovable', lead_days: 7, done: false }],
  ...o,
});

describe('roadmap rules', () => {
  it('due = launch date minus lead days', () => expect(dueDate('2026-11-16', 25)).toBe('2026-10-22'));
  it('kickoff fires at 14 days before the first item, once', () => {
    expect(kickoffDue(mk({ launch_date: '2026-12-31' }), '2026-11-21')).toBe(false); // first due Dec 6 = 15 days
    expect(kickoffDue(mk({ launch_date: '2026-12-31' }), '2026-11-22')).toBe(true);
    expect(kickoffDue(mk({ kickoff_sent_at: 'x' }), '2026-10-20')).toBe(false);
  });
  it('kickoff text mentions the build prompt only when stored', () => {
    expect(kickoffText(mk())).toBe('New initiative starting: Prepaid Year. Launches Nov 16, 2026. First step: Report visits, due Oct 22, 2026. Full checklist: /admin/roadmap');
    expect(kickoffText(mk({ build_prompt: 'x' }))).toContain('Build prompt ready to paste into Lovable.');
  });
  it('milestones only at 90/60/30/14/7 days', () => {
    expect(milestoneLine(mk(), '2026-11-09')).toBe('Prepaid Year: 7 days out, checklist 0% done.');
    expect(milestoneLine(mk(), '2026-11-10')).toBeNull();
  });
  it('coming up lists items due in the next 14 days', () => {
    expect(comingUp([mk()], '2026-10-20').map((r) => r.x.task)).toEqual(['Report visits']);
  });
  it('urgent on overdue or launch < 7 days with checklist under 100%', () => {
    expect(urgentReasons(mk(), '2026-10-23')).toHaveLength(1);
    expect(urgentReasons(mk(), '2026-11-12').some((r) => r.startsWith('Launches in 4 days'))).toBe(true);
    expect(urgentReasons(mk({ status: 'paused' }), '2026-11-12')).toEqual([]);
  });
  it('launch day: ON only when every item done and gate passes', () => {
    const done = mk({ items: mk().items.map((x) => ({ ...x, done: true })) });
    expect(launchDecision(done, '2026-11-16')).toEqual({ go: false, missing: ['Gate: Tests pass'] });
    expect(launchDecision({ ...done, gate_passed: true }, '2026-11-16')).toEqual({ go: true, missing: [] });
    expect(launchDecision(done, '2026-11-15')).toBeNull();
  });
});
