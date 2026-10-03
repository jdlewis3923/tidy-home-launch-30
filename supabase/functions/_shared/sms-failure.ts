// Tidy — a text that fails is never silent. Names the member or Pro and the
// message, and writes an admin alert row (database first, deduped per text).
import { writeAlert } from './alerts.ts';

const LABELS: Record<string, string> = {
  reservation_confirm: 'reservation confirmation',
  reservation_convert: 'convert link',
  post_visit_review: 'post-visit follow-up',
};

export async function alertSmsFailure(
  admin: any,
  opts: { phone: string; template?: string | null; error: string; key: string; status?: 'failed' | 'canceled' },
): Promise<void> {
  try {
    const { data: who } = await admin.rpc('sms_recipient_name', { _phone: opts.phone });
    const name = (typeof who === 'string' && who.trim()) ? who.trim() : `unknown recipient (${opts.phone.slice(0, -4)}••••)`;
    const what = LABELS[opts.template ?? ''] ?? (opts.template ?? 'text');
    await writeAlert(admin, {
      level: 'warning', category: 'site',
      title: `Text not delivered · ${name} · ${what}`,
      body: `${opts.status === 'canceled' ? 'Expired before it could send' : 'Failed to send'}: ${opts.error.slice(0, 220)}`,
      action_label: 'Open Command', action_url: '/admin/command',
      dedupe_key: `sms_fail:${opts.key}`,
      context: { template: opts.template ?? null, status: opts.status ?? 'failed' },
    });
  } catch (e) {
    console.error('[sms-failure] alert failed', (e as Error).message);
  }
}
