import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — Pro Intake & Kit Order submission handler
//
// POST { token: string }
// - Loads the pro_kit row by token (service role)
// - Builds the ready-to-order kit summary from the new kit standard and stores
//   it on the row, so /admin/pro-kits has a paste-ready vendor order
// - Advances the linked applicant's stage when one is linked
// - Emails hello@jointidy.co the same summary plus every submitted field
// - Emails the Pro one confirmation: what is coming, that it is free, and the
//   badge photo upload link (no separate message, ever)
//
// Copy rules: Tidy provides, the Pro chooses. Never "employee".
//
// The logo is a stable public path, never a rotated asset hash.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { tidyEmailShell } from '../_shared/email-brand.ts';
import {
  kitContentsLine,
  kitItemsFor,
  kitOrderSummary,
  kitServiceKey,
  KIT_SERVICE_LABEL,
  MAGNET_CREDIT_MONTHLY_USD,
  magnetTestHolds,
} from '../_shared/pro-kit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE = 'https://jointidy.co';
const OWNER = 'hello@jointidy.co';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
      ['shirt_size', 'Shirt size'],
      ['shirt_cut', 'Shirt cut'],
      ['vest_size', 'Hi-vis vest (lawn only)'],
      ['cap', 'Cap'],
    ],
  },
  {
    title: 'Vehicle advertising',
    fields: [
      ['magnets_opt_in', 'Wants magnets'],
      ['vehicle_year', 'Vehicle year'],
      ['vehicle_make', 'Make'],
      ['vehicle_model', 'Model'],
      ['vehicle_color', 'Color'],
      ['magnet_test', "Magnet sticks to driver's door"],
      ['vehicle_ad_signed_name', 'Agreement signed by'],
      ['vehicle_ad_signed_at', 'Agreement signed at'],
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

function shell(inner: string): string {
  return tidyEmailShell({ bodyHtml: inner });
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';
  if (token.length < 10) return jsonResponse({ error: 'invalid_token' }, 400);

  // Preview mode (admin "send a test to me"): both emails go to one address and
  // nothing on the record changes — no stage advance, no timestamps.
  const previewTo = typeof body?.preview_to === 'string' && body.preview_to.includes('@')
    ? body.preview_to
    : null;

  const { data: kit, error } = await admin.from('pro_kit').select('*').eq('token', token).maybeSingle();
  if (error) return jsonResponse({ error: 'lookup_failed', details: error.message }, 500);
  if (!kit) return jsonResponse({ error: 'not_found' }, 404);

  const row = kit as Record<string, unknown>;
  const serviceKey = kitServiceKey(kit.service_line);
  const summary = kitOrderSummary(row as never);
  const badgeUrl = kit.badge_photo_token ? `${SITE}/badge/${kit.badge_photo_token}` : null;

  if (!previewTo) await admin.from('pro_kit').update({ kit_summary: summary }).eq('id', kit.id);

  // Advance the linked applicant one step along the hiring pipeline.
  const PIPELINE = ['applied', 'background_check_review', 'interview_pending', 'offer_sent', 'contract_signed', 'oriented', 'active'];
  if (kit.applicant_id && !previewTo) {
    const { data: appRow } = await admin
      .from('applicants')
      .select('current_stage')
      .eq('id', kit.applicant_id)
      .maybeSingle();
    const cur = appRow?.current_stage ?? 'applied';
    const idx = PIPELINE.indexOf(cur);
    if (idx >= 0 && idx < PIPELINE.length - 1) {
      await admin.from('applicants').update({ current_stage: PIPELINE[idx + 1] }).eq('id', kit.applicant_id);
    }
    await admin.from('onboarding_events').insert({
      applicant_id: kit.applicant_id,
      event: 'intake_submitted',
      metadata: {
        shirt_size: kit.shirt_size ?? null,
        service_line: kit.service_line ?? null,
        magnets_opt_in: kit.magnets_opt_in ?? null,
      },
    });
  }

  const magnetHold = kit.magnets_opt_in === true && !magnetTestHolds(kit.magnet_test);
  const adminLink = `${SITE}/admin/pro-kits?kit=${kit.id}`;

  const rows = SECTIONS.map((s) => `
    <tr><td style="padding:18px 0 6px;font:700 13px Arial,sans-serif;color:#0A2A47;text-transform:uppercase;letter-spacing:.08em">${esc(s.title)}</td></tr>
    ${s.fields
      .map(
        ([k, label]) => `<tr><td style="padding:3px 0;font:14px Arial,sans-serif;color:#334155">
          <strong style="color:#0f172a">${esc(label)}:</strong> ${esc(display(row[k]))}
        </td></tr>`,
      )
      .join('')}
  `).join('');

  const ownerHtml = shell(`
    ${magnetHold ? `<p style="margin:0 0 16px;padding:12px;border:2px solid #dc2626;border-radius:10px;background:#fef2f2;font:700 15px Arial,sans-serif;color:#991b1b">DO NOT ORDER MAGNETS — the driver's door will not hold one (or was not tested).</p>` : ''}
    <h1 style="margin:0;font:800 20px Arial,sans-serif;color:#0A2A47">Kit ready to order</h1>
    <p style="margin:6px 0 0;font:14px Arial,sans-serif;color:#64748b">${esc(display(kit.legal_name))} · ${esc(KIT_SERVICE_LABEL[serviceKey].en)}</p>
    <p style="margin:18px 0 6px;font:700 13px Arial,sans-serif;color:#0A2A47;text-transform:uppercase;letter-spacing:.08em">Paste-ready vendor order</p>
    <pre style="margin:0;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font:13px/1.5 Menlo,Consolas,monospace;color:#0f172a;white-space:pre-wrap">${esc(summary)}</pre>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin:24px 0 0">
      <a href="${adminLink}" style="display:inline-block;background:#FCCC00;color:#0A2A47;font:700 14px Arial,sans-serif;padding:12px 18px;border-radius:10px;text-decoration:none">Open the kit record</a>
    </p>`);

  const contentsEn = kitContentsLine(serviceKey);
  const contentsEs = kitContentsLine(serviceKey, 'es');
  const magnetsYes = kit.magnets_opt_in === true;
  const itemList = kitItemsFor(serviceKey)
    .map((i) => `<li style="margin:4px 0">${i.qty} × ${esc(i.en)} / ${esc(i.es)}</li>`)
    .join('');

  const proHtml = shell(`
    <h1 style="margin:0 0 4px;font-size:21px">Your Tidy kit is on the way, ${esc(display(kit.badge_name))}</h1>
    <p style="margin:0 0 18px;font:14px Arial,sans-serif;color:#64748b">Su kit de Tidy está en camino.</p>
    <p style="margin:0 0 6px;font:15px Arial,sans-serif;color:#0f172a"><strong>Tidy provides this at no cost to you:</strong></p>
    <p style="margin:0 0 10px;font:14px Arial,sans-serif;color:#64748b">Tidy le entrega esto sin ningún costo para usted:</p>
    <ul style="margin:0 0 6px;padding-left:20px;font:15px Arial,sans-serif;color:#334155">${itemList}</ul>
    <p style="margin:0 0 18px;font:13px Arial,sans-serif;color:#94a3b8">${esc(contentsEn)} / ${esc(contentsEs)}</p>
    ${magnetsYes ? `<p style="margin:0 0 18px;font:14px Arial,sans-serif;color:#334155">
      You chose vehicle magnets, so a $${MAGNET_CREDIT_MONTHLY_USD}/month vehicle advertising credit goes out with your Friday deposit while they are on your car. You can take them off at any time.<br/>
      <span style="color:#64748b">Eligió los imanes, así que un crédito de $${MAGNET_CREDIT_MONTHLY_USD} al mes sale con su depósito del viernes mientras estén en su carro. Puede quitarlos cuando quiera.</span>
    </p>` : `<p style="margin:0 0 18px;font:14px Arial,sans-serif;color:#334155">
      You chose not to have vehicle magnets. Nothing else about your work changes, and you can change your mind any time.<br/>
      <span style="color:#64748b">Eligió no llevar imanes. Nada más en su trabajo cambia, y puede cambiar de opinión cuando quiera.</span>
    </p>`}
    <p style="margin:0 0 6px;font:15px Arial,sans-serif;color:#0f172a"><strong>One thing left: your badge photo.</strong></p>
    <p style="margin:0 0 10px;font:14px Arial,sans-serif;color:#334155">
      Head and shoulders, in your Tidy shirt, plain background. If your shirts have not arrived yet, send the photo once they do.<br/>
      <span style="color:#64748b">Cabeza y hombros, con su camisa de Tidy, fondo sencillo. Si sus camisas aún no llegan, envíe la foto cuando lleguen.</span>
    </p>
    ${badgeUrl ? `<p style="margin:12px 0 0"><a href="${badgeUrl}" style="display:inline-block;background:#f5c518;color:#0f172a;font:700 15px Arial,sans-serif;padding:13px 22px;border-radius:10px;text-decoration:none">Send your badge photo / Enviar su foto</a></p>` : ''}
    <p style="margin:22px 0 0;font:14px Arial,sans-serif;color:#475569">
      Your kit typically arrives in 7 to 10 days. Questions: <a href="mailto:${OWNER}" style="color:#2563eb">${OWNER}</a>.<br/>
      <span style="color:#64748b">Su kit llega normalmente en 7 a 10 días.</span>
    </p>`);

  const prefix = previewTo ? '[TEST] ' : '';
  let ownerSent = false;
  let proSent = false;
  try {
    await sendBrevoEmail({
      to: previewTo ?? OWNER,
      marketing: false,
      subject: `${prefix}Kit ready to order — ${display(kit.legal_name)} (${KIT_SERVICE_LABEL[serviceKey].en})`,
      htmlContent: ownerHtml,
      label: 'intake-submitted',
    });
    ownerSent = true;
  } catch (e) {
    console.error('intake-submitted owner email failed:', e instanceof Error ? e.message : String(e));
  }

  const proRecipient = previewTo ?? (kit.email ? String(kit.email) : null);
  if (proRecipient) {
    try {
      await sendBrevoEmail({
        to: proRecipient,
        marketing: false,
        subject: `${prefix}Your Tidy kit is on the way — one photo left / Su kit de Tidy va en camino`,
        htmlContent: proHtml,
        label: 'pro-kit-confirmation',
      });
      proSent = true;
      if (!previewTo) {
        await admin.from('pro_kit')
          .update({ pro_confirm_email_sent_at: new Date().toISOString() })
          .eq('id', kit.id);
      }
    } catch (e) {
      console.error('intake-submitted pro email failed:', e instanceof Error ? e.message : String(e));
    }
  }

  return jsonResponse({ ok: true, owner_emailed: ownerSent, pro_emailed: proSent, magnet_hold: magnetHold });
});
