type DigestAlert = { alert_type: string; title: string; dedupe_key?: string | null; action_url?: string | null; context?: Record<string, unknown> | null; resolved_at?: string | null; snoozed_until?: string | null };
export function visibleDigestAlerts<T extends DigestAlert>(rows: T[], testIds: Set<string>, now = Date.now()): T[] {
  const seen = new Set<string>();
  return rows.filter((a) => {
    const candidateId = String(a.context?.applicant_id ?? a.context?.contractor_id ?? '');
    const pathId = a.action_url?.match(/\/admin\/pipeline\/([a-f0-9-]+)/i)?.[1];
    if (a.resolved_at || (a.snoozed_until && Date.parse(a.snoozed_until) > now)
      || testIds.has(candidateId) || (pathId && testIds.has(pathId)) || a.context?.is_test === true || a.context?.is_test_row === true
      || /\btest(?:[-_ ](?:doc|candidate|pro|watchdog))?\b/i.test(a.title) || /^test[-_]/i.test(String(a.context?.document_id ?? '')) || a.alert_type.startsWith('test_')) return false;
    const key = a.dedupe_key ?? `${a.alert_type}:${a.title}:${candidateId}:${a.action_url ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function realCompletedApplications<T extends { apply_submitted_at?: string | null; is_test?: boolean; archived?: boolean }>(rows: T[], testIds: Set<string>, id: (row: T) => string): T[] {
  return rows.filter((r) => !!r.apply_submitted_at && !r.is_test && !r.archived && !testIds.has(id(r)));
}