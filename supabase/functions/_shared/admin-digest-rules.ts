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

export type CandidateSms = { id: string; phone: string; at: string; status: string; sid?: string | null; template?: string | null; releaseAt?: string | null };
export type DigestCandidate = { id: string; phone: string | null; first_name: string | null; last_name: string | null; archived?: boolean; is_test?: boolean };
const phoneDigits = (phone: string | null) => (phone ?? '').replace(/\D/g, '').slice(-10);
export function candidateTextActivity(messages: CandidateSms[], candidates: DigestCandidate[], testIds: Set<string>, since: string, until: string) {
  const byPhone = new Map<string, DigestCandidate>();
  const testPhones = new Set(candidates.filter(c => c.is_test || testIds.has(c.id)).map(c => phoneDigits(c.phone)));
  for (const c of candidates) {
    const key = phoneDigits(c.phone);
    if (key.length !== 10 || !c.first_name?.trim() || testPhones.has(key)) continue;
    const old = byPhone.get(key);
    if (!old || (old.archived && !c.archived)) byPhone.set(key, c);
  }
  const unique = new Map<string, CandidateSms>();
  for (const m of messages) {
    if (!byPhone.has(phoneDigits(m.phone))) continue;
    if (m.status !== 'queued' && (m.at < since || m.at >= until)) continue;
    if (!['sent', 'queued', 'failed', 'canceled', 'undelivered'].includes(m.status)) continue;
    const key = m.sid || m.id;
    const old = unique.get(key);
    if (!old || m.at >= old.at) unique.set(key, m);
  }
  return [...unique.values()].sort((a,b) => a.at.localeCompare(b.at)).flatMap(m => {
    const c = byPhone.get(phoneDigits(m.phone));
    if (!c) return [];
    return [{ ...m, applicantId: c.id, name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(), outcome: m.status === 'sent' && m.sid ? 'sent' as const : m.status === 'queued' ? 'queued' as const : 'failed' as const }];
  });
}