/**
 * TIDY Webhook Utilities
 * Centralized webhook URLs and helpers for firing Zapier webhooks
 * from the Tidy website and customer dashboard.
 *
 * Connected Zaps:
 * - POPUP_FORM  → "TIDY – Popup Form Submit Email + SMS + Sheet (VERIFIED)"
 * - DASHBOARD   → "TIDY – Dashboard Actions Confirmations (VERIFIED)"
 * - WEATHER     → "ZAP 23a — Weather Delay SMS (Tally Form)"
 */

export const WEBHOOK_URLS = {
    POPUP_FORM: "https://hooks.zapier.com/hooks/catch/26380119/un5oqdu/",
    DASHBOARD_ACTIONS: "https://hooks.zapier.com/hooks/catch/26380119/u732btj/",
    WEATHER_DELAY: "https://hooks.zapier.com/hooks/catch/26380119/u73ud7c/",
} as const;

type DashboardActionType = "skip" | "addon" | "pause" | "cancel" | "reschedule";

interface DashboardActionPayload {
    action_type: DashboardActionType;
    customer_phone: string;
    customer_email: string;
    customer_name: string;
    details?: string;
    timestamp?: string;
}

/**
 * Fire a dashboard action webhook to Zapier.
 * Routes through the "Dashboard Actions Confirmations" Zap
 * which splits into paths based on action_type.
 */
export async function fireDashboardAction(
    payload: DashboardActionPayload
  ): Promise<void> {
    try {
          await fetch(WEBHOOK_URLS.DASHBOARD_ACTIONS, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  mode: "no-cors",
                  body: JSON.stringify({
                            ...payload,
                            timestamp: payload.timestamp || new Date().toISOString(),
                            source: "customer_dashboard",
                  }),
          });
    } catch (err) {
          console.error("[Tidy] Dashboard webhook error:", err);
    }
}

/**
 * Fire a weather delay webhook to Zapier.
 * Used by ops to notify customers of weather-related delays.
 */
export async function fireWeatherDelay(payload: {
    customer_phone: string;
    customer_name: string;
    delay_reason: string;
    new_date?: string;
}): Promise<void> {
    try {
          await fetch(WEBHOOK_URLS.WEATHER_DELAY, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  mode: "no-cors",
                  body: JSON.stringify({
                            ...payload,
                            timestamp: new Date().toISOString(),
                            source: "ops_weather_form",
                  }),
          });
    } catch (err) {
          console.error("[Tidy] Weather webhook error:", err);
    }
}
