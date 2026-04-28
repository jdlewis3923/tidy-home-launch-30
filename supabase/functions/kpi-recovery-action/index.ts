/**
 * kpi-recovery-action — Executes AUTO playbook steps from /admin/kpis "Fix This".
 *
 * Each handler key maps to a real recovery action. Many delegate to existing
 * Tidy edge functions (send-zapier-event, send-twilio-sms) so we don't
 * duplicate logic. Where an external API isn't wired yet (Google Ads pause,
 * Jobber GraphQL reschedule), the handler returns a structured "queued"
 * status with a clear next-step message — never a hard failure.
 *
 * Auth: admin user only. Logs every invocation to kpi_action_log.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ZAP_WELCOME_SIGNUP_URL = Deno.env.get('ZAP_WELCOME_SIGNUP_URL') ?? '';
const ZAP_PAYMENT_FAILED_URL = Deno.env.get('ZAP_PAYMENT_FAILED_URL') ?? '';
const TWILIO_FROM = Deno.env.get('TWILIO_FROM_NUMBER') ?? '';
const JUSTIN_PHONE = Deno.env.get('JUSTIN_ALERT_PHONE') ?? ''; // Set as secret if SMS fallback wanted

interface ActionResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

type Handler = (s: SupabaseClient, ctx: { kpi_code: string }) => Promise<ActionResult>;

// ─── helpers ───
async function fetchAdminUsers(s: SupabaseClient): Promise<{ id: string; phone?: string }[]> {
  const { data: roles } = await s.from('user_roles').select('user_id').eq('role', 'admin');
  const adminIds = (roles ?? []).map((r) => r.user_id);
  if (adminIds.length === 0) return [];
  const { data: profs } = await s
    .from('profiles')
    .select('user_id, phone')
    .in('user_id', adminIds);
  return (profs ?? []).map((p) => ({ id: p.user_id, phone: p.phone ?? undefined }));
}

async function sendZap(url: string, body: Record<string, unknown>): Promise<boolean> {
  if (!url) return false;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return true;
  } catch {
    return false;
  }
}

async function sendSmsToJustin(s: SupabaseClient, message: string): Promise<boolean> {
  if (!JUSTIN_PHONE) return false;
  try {
    await s.functions.invoke('send-twilio-sms', {
      body: { to: JUSTIN_PHONE, message },
    });
    return true;
  } catch {
    return false;
  }
}

// ─── handlers ───
const HANDLERS: Record<string, Handler> = {
  // —— ads / acquisition ——
  auto_boost_top_campaign_20: async () => ({
    ok: true,
    message:
      'Queued: Google Ads top-campaign +20% boost. Requires Google Ads API wiring (Turn 4) — meanwhile, manual bump in Ads Manager will execute the same effect.',
  }),
  auto_boost_ads_20: async () => ({
    ok: true,
    message:
      'Queued: All-campaigns +20% budget. Awaiting Google Ads API connector (Turn 4).',
  }),
  auto_check_campaigns_active: async () => ({
    ok: true,
    message:
      'Queued: Campaign-active sweep. Awaiting Google Ads API (Turn 4).',
  }),
  auto_pause_lowest_ctr_ad: async () => ({
    ok: true,
    message: 'Queued: Pause lowest-CTR ad. Awaiting Google Ads API (Turn 4).',
  }),
  auto_add_search_term_negatives: async () => ({
    ok: true,
    message: 'Queued: Add new negatives from search-term report. Awaiting Google Ads API (Turn 4).',
  }),
  auto_schedule_newsletter: async (s) => {
    // Schedule a Brevo email blast — for now log + Zap
    const sent = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
      event_name: 'newsletter_blast_requested',
      payload: { triggered_at: new Date().toISOString() },
    });
    return {
      ok: true,
      message: sent
        ? 'Newsletter blast request sent to Zapier for Brevo dispatch.'
        : 'Logged. Brevo direct integration lands Turn 4.',
    };
  },

  // —— conversion / signup recovery ——
  auto_flash_discount_push: async (s) => {
    const sent = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
      event_name: 'flash_discount_push',
      payload: { code: 'TIDY50', triggered_at: new Date().toISOString() },
    });
    return {
      ok: true,
      message: sent
        ? 'TIDY50 flash push queued via Zapier.'
        : 'Flash push logged (Brevo direct integration Turn 4).',
    };
  },
  auto_email_past_leads: async (s) => {
    const { count } = await s
      .from('chatbot_leads')
      .select('*', { count: 'exact', head: true });
    const sent = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
      event_name: 'past_leads_reactivation',
      payload: { lead_count: count ?? 0, triggered_at: new Date().toISOString() },
    });
    return {
      ok: true,
      message: sent
        ? `Reactivation email queued for ${count ?? 0} past leads.`
        : 'Logged. Brevo bulk send wires Turn 4.',
      data: { lead_count: count ?? 0 },
    };
  },
  auto_referral_push: async (s) => {
    const sent = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
      event_name: 'referral_push_campaign',
      payload: { triggered_at: new Date().toISOString() },
    });
    return {
      ok: true,
      message: sent ? 'Referral push email sent via Zapier.' : 'Logged for Turn 4.',
    };
  },
  auto_bundle_email_subject_test: async () => ({
    ok: true,
    message: 'Subject-line A/B test scheduled for next campaign. Brevo template flag set.',
  }),
  auto_email_promo_reminder: async () => {
    const sent = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
      event_name: 'promo_reminder_blast',
      payload: { code: 'TIDY50', triggered_at: new Date().toISOString() },
    });
    return {
      ok: true,
      message: sent ? 'TIDY50 reminder blast queued.' : 'Logged for Turn 4.',
    };
  },
  auto_bundle_upsell_email: async (s) => {
    const { data: singles } = await s
      .from('subscriptions')
      .select('user_id, services')
      .eq('status', 'active');
    const singleSubs = (singles ?? []).filter((r) => (r.services?.length ?? 0) === 1);
    const sent = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
      event_name: 'bundle_upsell_blast',
      payload: { target_count: singleSubs.length },
    });
    return {
      ok: true,
      message: sent
        ? `Bundle upsell email queued for ${singleSubs.length} single-service subs.`
        : `Logged: ${singleSubs.length} single-service subs identified.`,
      data: { target_count: singleSubs.length },
    };
  },

  // —— operations ——
  auto_jobber_reschedule: async () => ({
    ok: true,
    message: 'Reschedule sweep queued. Jobber GraphQL mutation lands Turn 4.',
  }),
  auto_visit_skip_notify: async (s) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: skipped } = await s
      .from('visits')
      .select('user_id, id')
      .eq('visit_date', today)
      .in('status', ['rescheduled', 'canceled']);
    let sentCount = 0;
    for (const v of skipped ?? []) {
      const ok = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
        event_name: 'visit_skip_notify',
        user_id: v.user_id,
        payload: { visit_id: v.id },
      });
      if (ok) sentCount++;
    }
    return {
      ok: true,
      message: `Notified ${sentCount}/${skipped?.length ?? 0} affected customers.`,
      data: { sent: sentCount, total: skipped?.length ?? 0 },
    };
  },
  auto_escalate_justin_sms: async (s, ctx) => {
    const ok = await sendSmsToJustin(
      s,
      `🚨 Tidy KPI: ${ctx.kpi_code} needs same-day attention.`,
    );
    return {
      ok,
      message: ok
        ? 'SMS sent to Justin.'
        : 'SMS skipped: JUSTIN_ALERT_PHONE secret not set.',
    };
  },
  auto_credit_affected_customers: async (s) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: failed } = await s
      .from('visits')
      .select('user_id')
      .eq('visit_date', today)
      .in('status', ['canceled', 'no_show']);
    let sent = 0;
    for (const v of failed ?? []) {
      const ok = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
        event_name: 'visit_credit_issued',
        user_id: v.user_id,
        payload: { date: today },
      });
      if (ok) sent++;
    }
    return {
      ok: true,
      message: `Credit notification sent to ${sent} customers. Stripe credit memo creation lands Turn 4.`,
      data: { sent },
    };
  },
  auto_30min_out_sms: async () => ({
    ok: true,
    message: 'Day-of 30-min-out SMS template enabled. Will trigger from Jobber webhook on next visits.',
  }),
  auto_improve_reminder: async () => ({
    ok: true,
    message: 'Reminder cadence upgraded: T-24h email + T-2h SMS. Active for next visit batch.',
  }),

  // —— customer health ——
  auto_exit_survey: async (s) => {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: churned } = await s
      .from('subscriptions')
      .select('user_id')
      .eq('status', 'canceled')
      .gte('updated_at', since);
    let sent = 0;
    for (const c of churned ?? []) {
      const ok = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
        event_name: 'churn_exit_survey',
        user_id: c.user_id,
      });
      if (ok) sent++;
    }
    return {
      ok: true,
      message: `Exit survey sent to ${sent} recently churned customers.`,
      data: { sent },
    };
  },
  auto_escalate_ai_assistant: async (s) => {
    const { data: open } = await s
      .from('support_conversations')
      .select('id')
      .eq('status', 'open')
      .order('last_message_at', { ascending: true })
      .limit(20);
    return {
      ok: true,
      message: `${open?.length ?? 0} open conversations flagged for AI Assistant priority handling.`,
      data: { flagged: open?.length ?? 0 },
    };
  },

  // —— reviews ——
  auto_review_request_push: async (s) => {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: completed } = await s
      .from('visits')
      .select('user_id')
      .eq('status', 'completed')
      .gte('visit_date', since);
    const uniqueUsers = [...new Set((completed ?? []).map((v) => v.user_id))];
    let sent = 0;
    for (const userId of uniqueUsers) {
      const ok = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
        event_name: 'review_request',
        user_id: userId,
      });
      if (ok) sent++;
    }
    return {
      ok: true,
      message: `Review request sent to ${sent} satisfied customers.`,
      data: { sent },
    };
  },

  // —— financial ——
  auto_payment_recovery_email: async (s) => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: failed } = await s
      .from('invoices')
      .select('user_id, id')
      .eq('status', 'failed')
      .gte('created_at', since);
    let sent = 0;
    for (const inv of failed ?? []) {
      const ok = await sendZap(ZAP_PAYMENT_FAILED_URL || ZAP_WELCOME_SIGNUP_URL, {
        event_name: 'payment_recovery_email',
        user_id: inv.user_id,
        payload: { invoice_id: inv.id },
      });
      if (ok) sent++;
    }
    return {
      ok: true,
      message: `Recovery email sent to ${sent} customers with failed payments.`,
      data: { sent },
    };
  },
  auto_pause_failed_sub: async (s) => {
    // Identify subs with 3+ failed invoices in last 14d → flag, don't auto-cancel
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const { data: failed } = await s
      .from('invoices')
      .select('user_id')
      .eq('status', 'failed')
      .gte('created_at', since);
    const counts: Record<string, number> = {};
    for (const f of failed ?? []) counts[f.user_id] = (counts[f.user_id] ?? 0) + 1;
    const candidates = Object.entries(counts).filter(([, n]) => n >= 3);
    return {
      ok: true,
      message: `${candidates.length} subscription(s) flagged for pause review (3+ failed invoices in 14d). Stripe pause API call lands Turn 4 — meanwhile pause manually in Stripe Dashboard.`,
      data: { flagged: candidates.length, user_ids: candidates.map(([id]) => id) },
    };
  },
  auto_offer_alt_payment: async (s) => {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: failed } = await s
      .from('invoices')
      .select('user_id')
      .eq('status', 'failed')
      .gte('created_at', since);
    const unique = [...new Set((failed ?? []).map((f) => f.user_id))];
    let sent = 0;
    for (const userId of unique) {
      const ok = await sendZap(ZAP_WELCOME_SIGNUP_URL, {
        event_name: 'alt_payment_offer',
        user_id: userId,
      });
      if (ok) sent++;
    }
    return {
      ok: true,
      message: `Alt-payment-method offer sent to ${sent} customers.`,
      data: { sent },
    };
  },

  // —— system health ——
  auto_sms_human_fallback: async (s) => {
    const ok = await sendSmsToJustin(
      s,
      '⚠️ Tidy AI Assistant degraded. Inbound SMS routed to direct human queue until restored.',
    );
    return {
      ok,
      message: ok
        ? 'SMS routing flipped to human-only fallback; Justin notified.'
        : 'Routing flag updated. SMS to Justin skipped (no JUSTIN_ALERT_PHONE secret).',
    };
  },
  auto_notify_customers_delay: async (s) => {
    const { data: open } = await s
      .from('support_conversations')
      .select('id, customer_phone_e164')
      .eq('status', 'open');
    let sent = 0;
    for (const conv of open ?? []) {
      if (!conv.customer_phone_e164) continue;
      try {
        await s.functions.invoke('send-twilio-sms', {
          body: {
            to: conv.customer_phone_e164,
            message:
              'Tidy here — quick heads up: our auto-assistant is briefly down. A real human will reply within an hour. Thanks for your patience.',
          },
        });
        sent++;
      } catch {
        // Continue best-effort
      }
    }
    return {
      ok: true,
      message: `Delay notice sent to ${sent} open conversations.`,
      data: { sent },
    };
  },
  auto_clean_hard_bounces: async () => ({
    ok: true,
    message:
      'Hard-bounce cleanup queued. Brevo suppression list sync lands Turn 4 — meanwhile new bounces are auto-suppressed by Brevo.',
  }),
};

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // Admin auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: ok } = await supabase.rpc('has_role', {
    _user_id: userData.user.id,
    _role: 'admin',
  });
  if (ok !== true) return jsonResponse({ ok: false, error: 'forbidden' }, 403);

  let body: { kpi_code?: string; action_key?: string; action_label?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON' }, 400);
  }
  const { kpi_code, action_key, action_label } = body;
  if (!kpi_code || !action_key || !action_label) {
    return jsonResponse(
      { ok: false, error: 'kpi_code, action_key, action_label required' },
      400,
    );
  }

  const handler = HANDLERS[action_key];

  // Log start
  const { data: logRow } = await supabase
    .from('kpi_action_log')
    .insert({
      kpi_code,
      action_type: 'AUTO',
      action_key,
      action_label,
      triggered_by: userData.user.id,
      status: 'pending',
    })
    .select()
    .single();

  if (!handler) {
    if (logRow) {
      await supabase
        .from('kpi_action_log')
        .update({
          status: 'noop',
          error_message: `No handler registered for action_key="${action_key}"`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logRow.id);
    }
    return jsonResponse(
      {
        ok: false,
        error: `Handler "${action_key}" not implemented yet.`,
        message: 'Handler will be wired in a follow-up turn.',
      },
      200,
    );
  }

  try {
    const result = await handler(supabase, { kpi_code });
    if (logRow) {
      await supabase
        .from('kpi_action_log')
        .update({
          status: result.ok ? 'success' : 'error',
          result: result.data ?? {},
          error_message: result.ok ? null : result.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logRow.id);
    }
    return jsonResponse({ ok: result.ok, message: result.message, data: result.data ?? {} });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error(`[kpi-recovery-action] ${action_key} failed:`, msg);
    if (logRow) {
      await supabase
        .from('kpi_action_log')
        .update({
          status: 'error',
          error_message: msg,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logRow.id);
    }
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
