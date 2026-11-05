// Every failure a candidate hits is logged with its reason and raises an URGENT
// owner alert naming the person. Never throws — reporting must not mask the reply.
// deno-lint-ignore no-explicit-any
type Db = any;

export type CandidateFailure = {
  surface: 'contract-sign' | 'intake' | 'apply' | 'proof-upload' | 'booking' | 'signing-selftest';
  reason: string;
  status?: number;
  applicantId?: string | null;
  token?: string | null;
  detail?: Record<string, unknown>;
};

// Reasons that are the candidate's own input mistakes the page already explains.
const BENIGN = new Set(['full_name_and_agreement_required', 'invalid_request', 'method_not_allowed']);

export async function reportCandidateFailure(db: Db, f: CandidateFailure): Promise<void> {
  try {
    let who: { id: string; first_name?: string | null; last_name?: string | null; phone?: string | null; is_test_row?: boolean | null } | null = null;
    if (f.applicantId) {
      const { data } = await db.from('applicants').select('id,first_name,last_name,phone,is_test_row').eq('id', f.applicantId).maybeSingle();
      who = data;
    } else if (f.token) {
      const { data } = await db.from('applicants').select('id,first_name,last_name,phone,is_test_row')
        .or(`contract_token.eq.${f.token.replace(/[^a-zA-Z0-9]/g, '')}`).maybeSingle();
      who = data;
    }
    let test = Boolean(who?.is_test_row);
    if (who?.id && !test) {
      const { data: p } = await db.from('contractor_pipeline').select('is_test').eq('applicant_id', who.id).maybeSingle();
      test = Boolean(p?.is_test);
    }
    const name = who ? `${who.first_name ?? ''} ${who.last_name ?? ''}`.trim() || 'A candidate' : 'An unidentified candidate';
    await db.from('integration_logs').insert({
      source: 'internal', event: `candidate_failure:${f.surface}`, status: 'error',
      error_message: f.reason.slice(0, 500),
      detail: { ...f.detail, applicant_id: who?.id ?? null, status: f.status ?? null, is_test: test },
    });
    if (BENIGN.has(f.reason)) return;
    const hour = new Date().toISOString().slice(0, 13);
    await db.from('admin_alerts').upsert({
      alert_type: 'candidate_failure', level: 'critical', category: 'hiring',
      tier: test ? 'dashboard' : 'urgent',
      title: `${name} hit an error on ${f.surface}`,
      body: `Reason: ${f.reason}${f.status ? ` (HTTP ${f.status})` : ''}.${who?.phone ? ` Phone ${who.phone}.` : ''}`,
      context: { applicant_id: who?.id ?? null, surface: f.surface, reason: f.reason, is_test: test, ...f.detail },
      action_url: who?.id ? `/admin/pipeline/${who.id}` : '/admin/health',
      dedupe_key: `candidate-failure:${f.surface}:${who?.id ?? 'unknown'}:${f.reason.slice(0, 60)}:${hour}`,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  } catch (e) {
    console.error('[candidate-failure] report failed', e instanceof Error ? e.message : e);
  }
}
