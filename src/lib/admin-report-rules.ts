export type CandidateReportRow = { source?: string | null; apply_submitted_at?: string | null; archived?: boolean | null; is_test?: boolean | null; applicants?: { is_test_row?: boolean | null; first_name?: string | null; source?: string | null } | null };
export function visibleCandidate(row: CandidateReportRow) {
  return !row.archived && !row.is_test && !row.applicants?.is_test_row && !!row.applicants?.first_name?.trim();
}
export function candidateSource(source?: string | null, es = false) {
  if (source === 'indeed') return 'Indeed';
  if (source === 'apply_form' || source === 'apply_v5') return es ? 'Sitio de Tidy' : 'Tidy website';
  return es ? 'Origen sin confirmar' : 'Source unconfirmed';
}
export function candidateSubmission(row: CandidateReportRow, es = false) {
  return row.apply_submitted_at ? (es ? 'Enviada en Tidy' : 'Submitted on Tidy') : (es ? 'No enviada en Tidy' : 'Not submitted on Tidy');
}
/** One plain line: where they came from, and whether they finished the application on jointidy.co. */
export function candidateStatusLine(row: CandidateReportRow) {
  const from = `Found on ${candidateSource(row.source ?? row.applicants?.source)}`;
  if (!row.apply_submitted_at) return `${from} · Has NOT filled out the Tidy application yet`;
  const at = new Date(row.apply_submitted_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${from} · Finished the Tidy application on jointidy.co ${at} ET`;
}
export type InviteLinkStatus = 'submitted' | 'started' | 'not_started';
/** What the candidate did with the application link we texted them. */
export function inviteLinkStatus(row: { apply_submitted_at?: string | null; answers: number }): InviteLinkStatus {
  if (row.apply_submitted_at) return 'submitted';
  return row.answers > 0 ? 'started' : 'not_started';
}
