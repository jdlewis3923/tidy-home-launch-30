// Tidy — Pro Intake & Kit Order submission notifier
//
// POST { token: string }
// - Loads the pro_kit row by token (service role)
// - Advances the linked applicant's stage when one is linked
// - Emails hello@jointidy.co every submitted field, grouped by section
//
// No SMS is sent from this flow: TWILIO_FROM_NUMBER is unset and the send
// would fail silently.
//
// The logo is a stable public path, never a rotated asset hash.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE = 'https://jointidy.co';
const LOGO = `${SITE}/favicon-512x512.png`;
const OWNER = 'hello@jointidy.co';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAGNET_RISK = ['Aluminium — will NOT hold', 'Plastic or composite — will NOT hold', 'Unsure'];

const SECTIONS: { title: string; fields: [string, string][] }[] = [
  {
    title: 'Identity and contact',
    fields: [
      ['legal_name', 'Full legal name'],
      ['badge_name', 'Name for the badge'],
      ['mobile', 'Mobile'],
      ['email', 'Email'],
      ['home_zip', 'Home ZIP'],
      ['mail_address', 'Mailing address'],
      ['badge_back', 'Badge back language'],
    ],
  },
  {
    title: 'Apparel sizing',
    fields: [
      ['polo_size', 'Polo size'],
      ['polo_cut', 'Polo cut'],
      ['tee_size', 'Tee size'],
      ['tee_cut', 'Tee cut'],
      ['vest_size', 'Vest'],
      ['cap', 'Cap'],
    ],
  },
  {
    title: 'Vehicle and magnets',
    fields: [
      ['vehicle', 'Year / make / model'],
      ['vehicle_color', 'Colour'],
      ['vehicle_2', 'Second vehicle'],
      ['door_material', 'Door material'],
    ],
  },
  {
    title: 'Service line and equipment',
    fields: [
      ['service_line', 'Hired for'],
      ['cross_trained', 'Second line willing'],
      ['cross_which', 'Which second line'],
      ['equip_gap', 'Equipment gap'],
    ],
  },
  {
    title: 'Compliance',
    fields: [
      ['ins_carrier', 'Insurance carrier'],
      ['ins_policy', 'Policy number'],
      ['ins_expiry', 'Policy expiry'],
      ['dl_number', "Driver's licence number"],
      ['dl_expiry', 'Licence expiry'],
      ['auto_insurance', 'Auto insurance'],
    ],
  },
  {
    title: 'Availability',
    fields: [
      ['days', 'Days'],
      ['hours', 'Earliest start / latest finish'],
      ['visits_per_week', 'Visits per week'],
      ['max_drive', 'Maximum drive'],
      ['other_work', 'Other work kept'],
      ['first_available', 'First paid visit available'],
    ],
  },
];

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function display(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';
  if (token.length < 10) return jsonResponse({ error: 'invalid_token' }, 400);

  const { data: kit, error } = await admin.from('pro_kit').select('*').eq('token', token).maybeSingle();
  if (error) return jsonResponse({ error: 'lookup_failed', details: error.message }, 500);
  if (!kit) return jsonResponse({ error: 'not_found' }, 404);

  if (kit.applicant_id) {
    await admin
      .from('applicants')
      .update({ current_stage: 'onboarding' })
      .eq('id', kit.applicant_id);
  }

  const warn = MAGNET_RISK.includes(String(kit.door_material ?? ''));
  const adminLink = `${SITE}/admin/pro-kits?kit=${kit.id}`;

  const rows = SECTIONS.map((s) => `
    <tr><td style="padding:18px 0 6px;font:700 13px Arial,sans-serif;color:#0A2A47;text-transform:uppercase;letter-spacing:.08em">${esc(s.title)}</td></tr>
    ${s.fields
      .map(
        ([k, label]) => `<tr><td style="padding:3px 0;font:14px Arial,sans-serif;color:#334155">
          <strong style="color:#0f172a">${esc(label)}:</strong> ${esc(display((kit as Record<string, unknown>)[k]))}
        </td></tr>`,
      )
      .join('')}
  `).join('');

  const html = `
  <div style="background:#f1f5f9;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden">
      <div style="background:#0A2A47;padding:20px;text-align:center">
        <img src="${LOGO}" alt="Tidy" width="48" height="48" style="display:inline-block;border:0" />
      </div>
      <div style="padding:24px">
        ${warn ? `<p style="margin:0 0 16px;padding:12px;border:2px solid #dc2626;border-radius:10px;background:#fef2f2;font:700 15px Arial,sans-serif;color:#991b1b">DO NOT ORDER MAGNETS — door material must be verified in person.</p>` : ''}
        <h1 style="margin:0;font:800 20px Arial,sans-serif;color:#0A2A47">Intake received</h1>
        <p style="margin:6px 0 0;font:14px Arial,sans-serif;color:#64748b">${esc(display(kit.legal_name))} · ${esc(display(kit.service_line))}</p>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <p style="margin:24px 0 0">
          <a href="${adminLink}" style="display:inline-block;background:#FCCC00;color:#0A2A47;font:700 14px Arial,sans-serif;padding:12px 18px;border-radius:10px;text-decoration:none">Open the admin record</a>
        </p>
      </div>
    </div>
  </div>`;

  try {
    await sendBrevoEmail({
      to: OWNER,
      marketing: false,
      subject: `Intake received — ${display(kit.legal_name)} (${display(kit.service_line)})`,
      htmlContent: html,
      label: 'intake-submitted',
    });
  } catch (e) {
    console.error('intake-submitted email failed:', e instanceof Error ? e.message : String(e));
    return jsonResponse({ ok: true, emailed: false }, 200);
  }

  return jsonResponse({ ok: true, emailed: true });
});
