/**
 * Hiring-order gate for every older sender (advance-applicant, sequence-advance,
 * onboarding-email-send, pro-onboarding-reminders, checkr-invite, contract-sign).
 *
 * The eight-stage pipeline owns WHEN a candidate gets a document:
 *   ica / w9  -> only once equipment proof is approved and they are at agreement or later
 *   checkr    -> never automatic; Justin invites by hand on Checkr's site (stage background)
 *   kit       -> only once they are at active
 * Anything else that tries to send these earlier is refused here.
 */
// deno-lint-ignore no-explicit-any
type Admin = any;

export const STAGES = ['applied', 'screened', 'proof', 'agreement', 'ins_quote', 'background', 'insured', 'active'] as const;
export const stageIdx = (s: string | null | undefined) => STAGES.indexOf((s ?? '') as typeof STAGES[number]) + 1;

export type GateKind = 'ica' | 'checkr' | 'kit' | 'insurance' | 'onboarding';

export async function pipelineAllows(admin: Admin, applicantId: string, kind: GateKind): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: p } = await admin.from('contractor_pipeline')
    .select('stage, archived, proof_approved_at').eq('applicant_id', applicantId).maybeSingle();
  if (!p) return { ok: true }; // not a pipeline candidate (legacy/test rows)
  const at = stageIdx(p.stage);
  if (!p.proof_approved_at) return { ok: false, reason: 'Equipment proof not approved — no documents, Checkr or kit messages before proof.' };
  const need: Record<GateKind, string> = { ica: 'agreement', insurance: 'agreement', checkr: 'background', kit: 'active', onboarding: 'active' };
  if (at < stageIdx(need[kind])) return { ok: false, reason: `Candidate is at ${p.stage}; this message belongs to ${need[kind]} or later.` };
  return { ok: true };
}
