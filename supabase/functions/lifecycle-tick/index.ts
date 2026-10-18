// Tidy — lifecycle messaging engine tick.
//
// Drains public.message_queue: sends due SMS through send-twilio-sms and due
// email through _shared/brevo-send.ts. Enforces consent, quiet hours (via the
// queue's send_at, set by lifecycle_next_send_time), the 1-marketing-per-day
// cap, 3x retry with backoff (1m / 10m / 1h), SMS→email fallback on failure,
// and shadow mode (queues and logs what it WOULD send, sends nothing).
//
// Shadow mode: app_settings key 'lifecycle_shadow' = 'on' (default) parks every
// send as status 'dry_run'. A stage is live only when its name appears in the
// comma-separated app_settings key 'lifecycle_live_stages'. This is the Zapier
// cutover switch: Justin turns a Zap off, then the stage is added to the live
// list, one sequence at a time.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { renderLifecycleEmail } from '../_shared/lifecycle-email.ts';
import { lifecycleCanSend, lifecycleTemplatePair } from '../_shared/lifecycle-policy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RETRY_BACKOFF_MS = [60_000, 600_000, 3_600_000];
const BATCH = 50;

const CAN_SPAM_FOOTER =
  '<p style="font-size:12px;color:#64748b">Tidy Home Concierge LLC · 2121 Biscayne Blvd #1562, Miami FL 33137 · ' +
  '(786) 829-1141 · hello@jointidy.co<br><a href="{unsubscribe_link}">Unsubscribe from marketing emails</a></p>';

function fillTokens(text: string, tokens: Record<string, unknown>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (tokens[k] != null ? String(tokens[k]) : m));
}

async function getSetting(admin: ReturnType<typeof createClient>, key: string): Promise<string> {
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value ?? '').toString();
}

async function setSetting(admin: ReturnType<typeof createClient>, key: string, value: string) {
  await admin.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
}

async function sendSmsRow(admin: ReturnType<typeof createClient>, to: string, body: string, idem: string) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to_phone_e164: to,
      body,
      idempotency_key: idem,
      template_name: 'lifecycle',
      triggered_by: 'lifecycle-tick',
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (resp.status === 202 && data?.queued) return { ok: true as const, queued: true as const, sid: null };
  if (resp.ok && data?.sent) return { ok: true as const, queued: false as const, sid: data.message_sid ?? null };
  return { ok: false as const, error: `send-twilio-sms ${resp.status}: ${String(data?.error ?? '').slice(0, 200)}` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await isCronAuthorized(req))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Test mode: send every active email template to the owner inbox with sample tokens.
  const reqBody = await req.clone().json().catch(() => ({}));
  if (reqBody?.test === 'all_emails') {
    const sample: Record<string, string> = {
      first: 'Justin', plan: 'Cleaning + Lawn', pay_link: 'https://jointidy.co', link: 'https://jointidy.co',
      deadline: 'Fri 20 Nov', founding_number: '7', zip_name: 'Pinecrest', zip: '33156', wait_position: '3',
      spots_left: '5', review_link: 'https://jointidy.co', price_month: '$129', convert_date: 'Mon 16 Nov',
      launch: 'Mon 23 Nov', service: 'cleaning', size: 'Standard', sqft: '4,200',
    };
    const { data: tpls } = await admin.from('lifecycle_templates').select('*').eq('channel', 'email').eq('active', true).order('key');
    const out: Array<{ key: string; sent: boolean; reason?: string }> = [];
    for (const t of tpls ?? []) {
      const r = await sendBrevoEmail({
        to: { email: 'hello@jointidy.co', name: 'Justin (test)' },
        marketing: false,
        subject: `[TEST] ${fillTokens(t.subject_en ?? 'Tidy', sample)}`,
        htmlContent: renderLifecycleEmail({ rawBody: t.body_en, rawSubject: t.subject_en ?? 'Tidy', tokens: sample, templateKey: t.key }).html,
        label: `lifecycle-test:${t.key}`, adminChannel: 'test',
      }).catch((e) => ({ sent: false, reason: (e as Error).message } as any));
      out.push({ key: t.key, sent: !!r.sent, reason: r.sent ? undefined : String(r.reason ?? '') });
      await new Promise((res) => setTimeout(res, 300));
    }
    return new Response(JSON.stringify({ ok: true, total: out.length, sent: out.filter((o) => o.sent).length, out }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const shadow = (await getSetting(admin, 'lifecycle_shadow')) !== 'off';
  const liveStages = new Set(
    (await getSetting(admin, 'lifecycle_live_stages')).split(',').map((s) => s.trim()).filter(Boolean),
  );

  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  if ((await getSetting(admin, 'lifecycle_last_planned_day')) !== day) {
    const { error: planningError } = await admin.rpc('lifecycle_daily_events');
    if (!planningError) await setSetting(admin, 'lifecycle_last_planned_day', day);
    else console.error('[lifecycle-tick] daily planning failed', planningError.message);
  }
  // Claim due rows.
  const { data: due, error } = await admin
    .from('message_queue')
    .select('*')
    .eq('status', 'queued')
    .lte('send_at', new Date().toISOString())
    .order('send_at', { ascending: true })
    .limit(BATCH);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const results = { sent: 0, dry_run: 0, failed: 0, retried: 0, skipped_consent: 0, tasks: 0 };

  for (const row of due ?? []) {
    // Claim atomically-ish: only proceed if still queued.
    const { data: claimed } = await admin
      .from('message_queue')
      .update({ status: 'sending' })
      .eq('id', row.id)
      .eq('status', 'queued')
      .select('id');
    if (!claimed?.length) continue;

    const { data: contact } = await admin.from('contacts').select('*').eq('id', row.contact_id).single();
    if (!contact) {
      await admin.from('message_queue').update({ status: 'cancelled', error: 'contact missing' }).eq('id', row.id);
      continue;
    }

    let eventLive = false;
    if (row.event_id) {
      const { data: event } = await admin.from('lifecycle_events').select('event').eq('id', row.event_id).maybeSingle();
      if (event) {
        const { data: rule } = await admin.from('lifecycle_event_rules').select('live').eq('event', event.event).maybeSingle();
        eventLive = rule?.live === true;
      }
    }
    const allowedLive = lifecycleCanSend({ shadow, test: contact.is_test, forceShadow: row.force_shadow, eventBacked: !!row.event_id, eventLive, stageLive: liveStages.has(row.stage) });
    if (!allowedLive && row.channel !== 'task') {
      await admin.from('message_queue').update({ status: 'dry_run', sent_at: new Date().toISOString() }).eq('id', row.id);
      results.dry_run++;
      continue;
    }
    // Admin task rows become Today-list alerts, never sends.
    if (row.channel === 'task') {
      if (allowedLive) {
        await admin.from('admin_alerts').insert({
          alert_type: 'lifecycle_task', level: 'critical', category: 'operations', tier: 'urgent',
          title: fillTokens(row.template_key ?? 'Lifecycle task', row.tokens),
          body: fillTokens(row.template_key ?? '', row.tokens),
          dedupe_key: `lifecycle_task:${row.id}`,
        });
        await admin.from('message_queue').update({ status: 'task_done', sent_at: new Date().toISOString() }).eq('id', row.id);
        results.tasks++;
      } else {
        await admin.from('message_queue').update({ status: 'dry_run', sent_at: new Date().toISOString() }).eq('id', row.id);
        results.dry_run++;
      }
      continue;
    }

    // Consent gates.
    const wantsSms = row.channel === 'sms';
    if (wantsSms) {
      const allowed = row.marketing
        ? contact.sms_marketing && !contact.sms_stopped
        : contact.sms_service && !contact.sms_stopped;
      if (!allowed || !contact.phone) {
        // Marketing text without consent → email version only, if one exists.
        const { data: emailTpl } = await admin
          .from('lifecycle_templates').select('*')
          .eq('key', lifecycleTemplatePair(row.template_key)).eq('channel', 'email').eq('active', true).maybeSingle();
        if (emailTpl && contact.email && (row.marketing ? contact.email_marketing && !contact.email_suppressed : true)) {
          await admin.from('message_queue').update({ channel: 'email', template_key: emailTpl.key }).eq('id', row.id);
          row.channel = 'email';
          row.template_key = emailTpl.key;
        } else {
          await admin.from('message_queue').update({ status: 'cancelled', error: 'no consent' }).eq('id', row.id);
          results.skipped_consent++;
          continue;
        }
      }
    } else if (row.channel === 'email' && row.marketing && (!contact.email_marketing || contact.email_suppressed)) {
      await admin.from('message_queue').update({ status: 'cancelled', error: 'email marketing off' }).eq('id', row.id);
      results.skipped_consent++;
      continue;
    }

    // Frequency cap: max 1 marketing message per contact per day.
    if (row.marketing && contact.last_marketing_sent_at) {
      const last = new Date(contact.last_marketing_sent_at).getTime();
      if (Date.now() - last < 24 * 3600_000) {
        const { data: nextTs } = await admin.rpc('lifecycle_next_send_time', {
          _at: new Date(last + 24 * 3600_000).toISOString(),
        });
        await admin.from('message_queue').update({ status: 'queued', send_at: nextTs }).eq('id', row.id);
        continue;
      }
    }

    // Template: ES only when reviewed, otherwise EN.
    const { data: tpl } = await admin
      .from('lifecycle_templates').select('*')
      .eq('key', row.template_key).eq('channel', row.channel).eq('active', true).maybeSingle();
    if (!tpl) {
      await admin.from('message_queue').update({ status: 'failed', error: `no template ${row.template_key}/${row.channel}` }).eq('id', row.id);
      results.failed++;
      continue;
    }
    const useEs = contact.lang === 'es' && tpl.es_reviewed && tpl.body_es;
    const bodyText = fillTokens(useEs ? tpl.body_es : tpl.body_en, row.tokens);
    const subject = fillTokens(useEs ? (tpl.subject_es ?? tpl.subject_en ?? '') : (tpl.subject_en ?? ''), row.tokens);

    const isLive = allowedLive;
    if (!isLive) {
      await admin.from('message_queue').update({ status: 'dry_run', sent_at: new Date().toISOString() }).eq('id', row.id);
      results.dry_run++;
      continue;
    }

    let sendOk = false;
    let providerId: string | null = null;
    let sendError: string | null = null;

    if (row.channel === 'sms') {
      const r = await sendSmsRow(admin, contact.phone, bodyText, `lifecycle-${row.id}-a${row.attempts}`);
      sendOk = r.ok;
      if (r.ok) providerId = r.sid;
      else sendError = r.error ?? 'sms failed';
    } else {
      try {
        const { html } = renderLifecycleEmail({
          rawBody: useEs ? tpl.body_es : tpl.body_en,
          rawSubject: useEs ? (tpl.subject_es ?? tpl.subject_en ?? '') : (tpl.subject_en ?? ''),
          tokens: { first: contact.first_name ?? '', ...(row.tokens ?? {}) }, templateKey: row.template_key, lang: useEs ? 'es' : 'en',
          footerHtml: row.marketing ? CAN_SPAM_FOOTER.replace('{unsubscribe_link}', `${SUPABASE_URL}/functions/v1/lifecycle-unsubscribe?c=${contact.id}`) : '',
        });
        const r = await sendBrevoEmail({
          to: { email: contact.email, name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || undefined },
          marketing: row.marketing,
          subject: subject || 'Tidy',
          htmlContent: html,
          label: `lifecycle:${row.template_key}`,
        });
        sendOk = r.sent;
        providerId = r.messageId ?? null;
        if (!r.sent) sendError = `brevo: ${r.reason}${r.status ? ` ${r.status}` : ''}`;
      } catch (e) {
        sendError = (e as Error).message;
      }
    }

    if (sendOk) {
      await admin.from('message_queue').update({ status: 'sent', provider_id: providerId, sent_at: new Date().toISOString() }).eq('id', row.id);
      if (row.marketing) {
        await admin.from('contacts').update({ last_marketing_sent_at: new Date().toISOString() }).eq('id', contact.id);
      }
      results.sent++;
      continue;
    }

    // Retry with backoff, then fail. SMS failure falls back to the email version.
    if (row.attempts < 3) {
      const { data: retryAt } = await admin.rpc('lifecycle_next_send_time', { _at: new Date(Date.now() + RETRY_BACKOFF_MS[row.attempts]).toISOString() });
      await admin.from('message_queue').update({ status: 'queued', attempts: row.attempts + 1, send_at: retryAt, error: sendError }).eq('id', row.id);
      results.retried++;
    } else {
      let fellBack = false;
      if (row.channel === 'sms') {
        const { data: emailTpl } = await admin
          .from('lifecycle_templates').select('key').eq('key', lifecycleTemplatePair(row.template_key)).eq('channel', 'email').eq('active', true).maybeSingle();
        if (emailTpl && contact.email) {
          await admin.from('message_queue').insert({
            contact_id: contact.id, stage: row.stage, step_order: row.step_order,
            template_key: emailTpl.key, channel: 'email', marketing: row.marketing,
            tokens: row.tokens, send_at: new Date().toISOString(),
          });
          fellBack = true;
        }
      }
      await admin.from('message_queue').update({ status: 'failed', error: `${sendError}${fellBack ? ' (email fallback queued)' : ''}` }).eq('id', row.id);
      await admin.from('admin_alerts').insert({
        alert_type: 'lifecycle_send_failed', level: 'warning', category: 'operations', tier: 'digest',
        title: `Message failed: ${contact.first_name ?? contact.email ?? contact.phone} · ${row.template_key}`,
        body: (sendError ?? '').slice(0, 300),
        dedupe_key: `lifecycle_fail:${row.id}`,
      }).then(() => {}, () => {});
      results.failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, shadow, ...results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
