type DigestAlert = { alert_type: string; title: string; context?: Record<string, unknown> | null; resolved_at?: string | null; snoozed_until?: string | null };
export function visibleDigestAlerts<T extends DigestAlert>(rows: T[], testIds: Set<string>, now = Date.now()): T[] {
  return rows.filter((a) => !a.resolved_at && !(a.snoozed_until && Date.parse(a.snoozed_until) > now)
    && !testIds.has(String(a.context?.applicant_id ?? '')) && a.context?.is_test !== true && a.context?.is_test_row !== true
    && !/^\[TEST\]|^Test\b/i.test(a.title) && !a.alert_type.startsWith('test_'));
}
export function realCompletedApplications<T extends { apply_submitted_at?: string | null; is_test?: boolean; archived?: boolean }>(rows: T[], testIds: Set<string>, id: (row: T) => string): T[] {
  return rows.filter((r) => !!r.apply_submitted_at && !r.is_test && !r.archived && !testIds.has(id(r)));
}