// Tidy — Zapier event emitter (placeholder for Phase 6 wiring)
//
// All transactional email + SMS for Tidy is orchestrated through Zapier
// (which calls Brevo + Twilio). Edge functions never call Brevo/Twilio
// directly — they fire Zapier webhooks and let existing Zaps deliver.
//
// Phase 2 ships this in placeholder mode: it accepts any event_name +
// payload, logs it via withLogging, and is a no-op when the matching
// ZAP_*_URL secret is not set. Phase 6 will add the per-event URL
// secrets and this function will start firing real webhooks.

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

// Map event name → secret name. Phase 6 adds the secrets; until then this
// function logs the attempt and returns ok without calling out.
const EVENT_SECRET_MAP: Record<string, string> = {
  subscription_confirmed: 'ZAP_SUBSCRIPTION_CONFIRMED_URL',
  payment_failed: 'ZAP_PAYMENT_FAILED_URL',
  visit_complete: 'ZAP_VISIT_COMPLETE_URL',
  visit_scheduled: 'ZAP_VISIT_SCHEDULED_URL',
  visit_canceled: 'ZAP_VISIT_CANCELED_URL',
  subscription_canceled: 'ZAP_SUBSCRIPTION_CANCELED_URL',
  account_provisioned: 'ZAP_ACCOUNT_PROVISIONED_URL',
};

interface EventBody {
  event_name?: string;
  payload?: unknown;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  let body: EventBody = {};
  try {
    body = (await req.json()) as EventBody;
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }

  const eventName = body.event_name;
  if (!eventName || typeof eventName !== 'string') {
    return jsonResponse({ ok: false, error: 'event_name required' }, 400);
  }

  try {
    const result = await withLogging({
      source: 'zapier',
      event: eventName,
      payload: body.payload,
      fn: async () => {
        const secretName = EVENT_SECRET_MAP[eventName];
        const url = secretName ? Deno.env.get(secretName) : undefined;

        if (!url) {
          // Phase 2 placeholder mode — log and return.
          return { ok: true as const, dispatched: false, mode: 'placeholder' as const };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body.payload ?? {}),
        });

        if (!res.ok) {
          throw new Error(`zapier ${eventName} returned ${res.status}`);
        }

        return { ok: true as const, dispatched: true, mode: 'live' as const };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[send-zapier-event] failed', eventName, message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
