export type CandidateReportRow = { source?: string | null; apply_submitted_at?: string | null; archived?: boolean | null; is_test?: boolean | null; applicants?: { is_test_row?: boolean | null; first_name?: string | null } | null };
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