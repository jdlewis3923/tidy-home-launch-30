// Tidy — Shared Zap webhook auth helper.
//
// Accepts EITHER:
//   1. Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>  (internal callers)
//   2. X-Zap-Webhook-Secret: <ZAP_WEBHOOK_SECRET>         (Zapier inbound)
//
// Use in any edge function that's called both internally AND by Zapier,
// so we don't expose the service role key to third-party automation.

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ZAP_WEBHOOK_SECRET = Deno.env.get('ZAP_WEBHOOK_SECRET') ?? '';

/** Constant-time string compare (avoids timing attacks). */
function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function isServiceOrZapAuthorized(req: Request): boolean {
  // Path 1: service-role bearer
  const auth = req.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    if (SUPABASE_SERVICE_ROLE_KEY && safeEquals(token, SUPABASE_SERVICE_ROLE_KEY)) {
      return true;
    }
  }
  // Path 2: Zap webhook secret header
  const zapHeader = req.headers.get('X-Zap-Webhook-Secret') ?? req.headers.get('x-zap-webhook-secret') ?? '';
  if (ZAP_WEBHOOK_SECRET && zapHeader.length > 0 && safeEquals(zapHeader, ZAP_WEBHOOK_SECRET)) {
    return true;
  }
  return false;
}
