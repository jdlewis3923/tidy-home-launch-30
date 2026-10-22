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

/** Two separate answers for every applicant: did they apply on Indeed, and what did they do with the Tidy link we texted? */
export type ChannelInput = { source?: string | null; applicantSource?: string | null; hasLink?: boolean; invited_at?: string | null; apply_submitted_at?: string | null; answers: number; now?: number };
export type LinkState = 'submitted' | 'started' | 'not_started' | 'scheduled' | 'not_sent' | 'direct';
export function applicationChannels(r: ChannelInput) {
  const src = r.source ?? r.applicantSource ?? null;
  const indeed = src === 'indeed';
  const direct = src === 'apply_form' || src === 'apply_v5';
  const at = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
  let link: LinkState;
  if (direct) link = r.apply_submitted_at ? 'direct' : (r.answers > 0 ? 'started' : 'not_started');
  else if (r.apply_submitted_at) link = 'submitted';
  else if (r.answers > 0) link = 'started';
  else if (!r.hasLink) link = 'not_sent';
  else if (r.invited_at && new Date(r.invited_at).getTime() > (r.now ?? Date.now())) link = 'scheduled';
  else link = 'not_started';
  const indeedLabel = indeed ? 'Indeed: YES, applied' : 'Indeed: NO';
  const linkLabel = {
    submitted: `Our texted link: SUBMITTED ${r.apply_submitted_at ? at(r.apply_submitted_at) : ''}`.trim(),
    direct: `Tidy website: SUBMITTED on their own ${r.apply_submitted_at ? at(r.apply_submitted_at) : ''}`.trim(),
    started: `${direct ? 'Tidy website' : 'Our texted link'}: started, NOT submitted (${r.answers} answers)`,
    not_started: `${direct ? 'Tidy website' : 'Our texted link'}: NOT started (0 answers)`,
    scheduled: `Our texted link: not sent yet (goes out ${r.invited_at ? at(r.invited_at) : ''})`.trim(),
    not_sent: 'Our texted link: never sent',
  }[link];
  return { indeed, indeedLabel, link, linkLabel, submitted: link === 'submitted' || link === 'direct' };
}
