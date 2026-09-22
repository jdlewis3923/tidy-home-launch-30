import './http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — Pro onboarding state, links and reminder copy.
 *
 * One email collects all three things a new Pro must finish: the background
 * check (Checkr invites them directly), the insurance certificate (/coi/:token)
 * and the intake + kit order (/intake/:token). This module is the single source
 * of truth for what is still outstanding, so the welcome email, the reminder
 * email and the admin chips can never disagree.
 *
 * Copy rules enforced here: Pros are 1099 independent contractors, never
 * "employees"; the kit is provided, never required; pay is per job, sized by the
 * home, every Friday — no percentage model, no floors, no stipend, no bonuses.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const SITE = 'https://jointidy.co';
/** Stable public asset path — never a build-hashed filename. */
export const LOGO = `${SITE}/favicon-512x512.png`;
export const OWNER_EMAIL = 'hello@jointidy.co';

export type StepStatus = 'not_sent' | 'sent' | 'received' | 'verified';
export type StepKey = 'background_check' | 'insurance' | 'intake';

export interface OnboardingApplicant {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  current_stage: string | null;
  bg_check_status: string | null;
  checkr_invitation_id: string | null;
  checkr_report_status: string | null;
  coi_token: string | null;
  coi_token_expires_at: string | null;
  coi_pdf_url: string | null;
  coi_review_status: string | null;
  onboarding_email_sent_at: string | null;
  onboarding_reminder_count: number | null;
  onboarding_reminder_last_at: string | null;
}

export interface OnboardingKit {
  token: string | null;
  token_expires_at: string | null;
  status: string | null;
}

export interface OnboardingState {
  background_check: StepStatus;
  insurance: StepStatus;
  intake: StepStatus;
  coi_url: string | null;
  intake_url: string | null;
  checkr_url: string | null;
  outstanding: StepKey[];
}

export const STEP_LABEL: Record<StepKey, { en: string; es: string }> = {
  background_check: { en: 'Background check', es: 'Verificación de antecedentes' },
  insurance: { en: 'Your insurance certificate', es: 'Su certificado de seguro' },
  intake: { en: 'Your sizes and kit', es: 'Sus tallas y su kit' },
};

export function checkrInviteUrl(applicant: { checkr_invitation_id: string | null }): string | null {
  // Checkr emails the candidate its own hosted invitation; the applicant-facing
  // entry point is that invitation. Until the invitation exists there is no
  // link to give, and the email must say so rather than show a dead button.
  return applicant.checkr_invitation_id
    ? `https://apply.checkr.com/invitations/${applicant.checkr_invitation_id}`
    : null;
}

export function computeOnboardingState(
  applicant: OnboardingApplicant,
  kit: OnboardingKit | null,
): OnboardingState {
  const bg: StepStatus = applicant.bg_check_status === 'clear'
    ? 'verified'
    : applicant.checkr_report_status && applicant.checkr_report_status !== 'invitation_pending'
      ? 'received'
      : applicant.checkr_invitation_id
        ? 'sent'
        : 'not_sent';

  const coiVerified = applicant.coi_review_status === 'approved' || applicant.coi_review_status === 'verified';
  const insurance: StepStatus = coiVerified
    ? 'verified'
    : applicant.coi_pdf_url
      ? 'received'
      : applicant.coi_token
        ? 'sent'
        : 'not_sent';

  const intake: StepStatus = kit?.status === 'kit_issued' || kit?.status === 'kit_ordered'
    ? 'verified'
    : kit?.status === 'submitted'
      ? 'received'
      : kit?.token
        ? 'sent'
        : 'not_sent';

  const outstanding: StepKey[] = [];
  if (bg === 'not_sent' || bg === 'sent') outstanding.push('background_check');
  if (insurance === 'not_sent' || insurance === 'sent') outstanding.push('insurance');
  if (intake === 'not_sent' || intake === 'sent') outstanding.push('intake');

  return {
    background_check: bg,
    insurance,
    intake,
    coi_url: applicant.coi_token ? `${SITE}/coi/${applicant.coi_token}` : null,
    intake_url: kit?.token ? `${SITE}/intake/${kit.token}` : null,
    checkr_url: checkrInviteUrl(applicant),
    outstanding,
  };
}

/** Mints (or refreshes) both token links via the admin RPC. Service-role only. */
export async function ensureOnboardingTokens(
  admin: SupabaseClient,
  applicantId: string,
  regenerate = false,
): Promise<{ coi_token: string | null; intake_token: string | null }> {
  const { data, error } = await admin.rpc('admin_onboarding_tokens', {
    _applicant_id: applicantId,
    _regenerate: regenerate,
  });
  if (error) throw new Error(`token_mint_failed: ${error.message}`);
  const row = (data ?? {}) as { coi_token?: string; intake_token?: string };
  return { coi_token: row.coi_token ?? null, intake_token: row.intake_token ?? null };
}

export async function loadOnboarding(
  admin: SupabaseClient,
  applicantId: string,
): Promise<{ applicant: OnboardingApplicant; kit: OnboardingKit | null; state: OnboardingState }> {
  const { data: applicant, error } = await admin
    .from('applicants')
    .select(
      'id, first_name, last_name, email, current_stage, bg_check_status, checkr_invitation_id, checkr_report_status, coi_token, coi_token_expires_at, coi_pdf_url, coi_review_status, onboarding_email_sent_at, onboarding_reminder_count, onboarding_reminder_last_at',
    )
    .eq('id', applicantId)
    .maybeSingle();
  if (error || !applicant) throw new Error('applicant_not_found');

  const { data: kit } = await admin
    .from('pro_kit')
    .select('token, token_expires_at, status')
    .eq('applicant_id', applicantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    applicant: applicant as OnboardingApplicant,
    kit: (kit ?? null) as OnboardingKit | null,
    state: computeOnboardingState(applicant as OnboardingApplicant, (kit ?? null) as OnboardingKit | null),
  };
}

function button(url: string, label: string): string {
  return `<p style="margin:12px 0 0"><a href="${url}" style="display:inline-block;background:#f5c518;color:#0f172a;font:700 15px Arial,sans-serif;padding:13px 22px;border-radius:10px;text-decoration:none">${label}</a></p>`;
}

const STEP_BODY: Record<StepKey, { en: string; es: string; cta: { en: string; es: string } }> = {
  background_check: {
    en: 'We pay for it. Checkr emails you directly and collects everything itself — Tidy never sees those details.',
    es: 'Nosotros lo pagamos. Checkr le escribe directamente y recoge los datos; Tidy nunca los ve.',
    cta: { en: 'Start the background check', es: 'Comenzar la verificación' },
  },
  insurance: {
    en: 'A commercial general liability policy, $1,000,000 per occurrence and $2,000,000 aggregate, listing Tidy Home Concierge LLC as Additional Insured. It must be active and verified before your first paid visit. Tidy reimburses up to $50 a month toward the premium for your first 3 months, paid with your Friday deposit once the certificate is verified.',
    es: 'Una póliza de responsabilidad civil comercial, $1,000,000 por incidente y $2,000,000 en agregado, con Tidy Home Concierge LLC como Asegurado Adicional. Debe estar activa y verificada antes de su primera visita pagada. Tidy le reembolsa hasta $50 al mes de la prima durante los primeros 3 meses, con su depósito del viernes, una vez verificado el certificado.',
    cta: { en: 'Upload your certificate', es: 'Subir su certificado' },
  },
  intake: {
    en: 'Shirt size, vehicle and availability, so your polos, vest and badge are ready on day one.',
    es: 'Talla de camisa, vehículo y disponibilidad, para que sus polos, chaleco y credencial estén listos el primer día.',
    cta: { en: 'Send your sizes', es: 'Enviar sus tallas' },
  },
};

/**
 * Reminder email: ONE email listing only what is still missing, with the same
 * buttons as the welcome email. Never one email per outstanding item.
 */
export function reminderEmailHtml(
  firstName: string,
  state: OnboardingState,
  dayCount: number,
): { subject: string; html: string } {
  const blocks = state.outstanding.map((key, i) => {
    const url = key === 'insurance' ? state.coi_url : key === 'intake' ? state.intake_url : state.checkr_url;
    const body = STEP_BODY[key];
    const label = STEP_LABEL[key];
    const cta = url ? button(url, body.cta.en) : `<p style="margin:12px 0 0;font:14px Arial,sans-serif;color:#64748b">Your invitation is on its way — nothing for you to do yet. / Su invitación está en camino, no tiene que hacer nada todavía.</p>`;
    return `
      <div style="margin:0 0 22px;padding:18px;border:1px solid #e2e8f0;border-radius:12px">
        <p style="margin:0;font:700 16px Arial,sans-serif;color:#0f172a">${i + 1}. ${label.en} / ${label.es}</p>
        <p style="margin:8px 0 0;font:14px Arial,sans-serif;color:#475569">${body.en}</p>
        <p style="margin:6px 0 0;font:14px Arial,sans-serif;color:#64748b">${body.es}</p>
        ${cta}
      </div>`;
  }).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:600px;margin:0 auto;background:#ffffff">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a"><tr>
        <td style="padding:16px 24px" valign="middle" align="left"><img src="${LOGO}" alt="Tidy" width="42" height="42" style="display:block;width:42px;height:42px;border:0"/></td>
        <td style="padding:16px 24px;font:700 13px Arial,sans-serif;color:#ffffff;line-height:1.35;text-align:right" valign="middle" align="right">More life.<br/><span style="color:#FCCC00">Less chores.</span></td>
      </tr></table>
      <div style="height:4px;background:#FCCC00"></div>
      <div style="padding:26px 24px">
        <h1 style="margin:0 0 6px;font-size:21px">Hi ${firstName}, ${state.outstanding.length === 1 ? 'one thing' : `${state.outstanding.length} things`} left before your first visit</h1>
        <p style="margin:0 0 18px;font:14px Arial,sans-serif;color:#64748b">Hola ${firstName}, ${state.outstanding.length === 1 ? 'queda una cosa' : `quedan ${state.outstanding.length} cosas`} antes de su primera visita. About ${state.outstanding.length * 5} minutes total.</p>
        ${blocks}
        <p style="margin:22px 0 0;font:14px Arial,sans-serif;color:#475569">
          Once these are done, Justin confirms, the contract is signed, your kit is issued and your route starts.<br/>
          <span style="color:#64748b">Cuando termine, Justin confirma, se firma el contrato, se entrega su kit y comienza su ruta.</span>
        </p>
        <p style="margin:16px 0 0;font:14px Arial,sans-serif;color:#475569">
          You are paid per job, sized by the home, every Friday.<br/>
          <span style="color:#64748b">Se paga por trabajo, según el tamaño de la casa, cada viernes.</span>
        </p>
        <p style="margin:16px 0 0;font:14px Arial,sans-serif;color:#475569">
          Questions: <a href="mailto:${OWNER_EMAIL}" style="color:#2563eb">${OWNER_EMAIL}</a>, Mon–Sat 8:00 AM–6:00 PM ET.
        </p>
      </div>
      <div style="padding:16px 24px;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0">
        Tidy Home Concierge LLC · 2121 Biscayne Blvd #1562, Miami, FL 33137 · jointidy.co · (786) 829-1141 · You are receiving this because you are completing onboarding as an independent contractor with Tidy.
      </div>
    </div></body></html>`;

  return {
    subject: `Tidy onboarding — ${state.outstanding.length === 1 ? '1 thing' : `${state.outstanding.length} things`} still to finish (day ${dayCount})`,
    html,
  };
}
