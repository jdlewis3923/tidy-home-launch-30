// Tidy — in-app + web-push notification helper for Pros.
//
// Every Pro-facing notification lands in public.pro_notifications (the bell
// feed on /pro) and, best-effort, as a web push. Nothing here goes through
// Zapier.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export type ProNotification = {
  contractor_id: string;
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  context?: Record<string, unknown>;
};

// deno-lint-ignore no-explicit-any
export async function notifyPro(admin: any, n: ProNotification): Promise<boolean> {
  const { error } = await admin.from('pro_notifications').insert({
    contractor_id: n.contractor_id,
    kind: n.kind,
    title: n.title,
    body: n.body ?? null,
    url: n.url ?? null,
    context: n.context ?? {},
  });
  if (error) {
    console.error('[pro-notify] insert failed', error.message);
    return false;
  }

  // Best effort push — a missing VAPID key or subscription must never fail
  // the caller.
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-pwa-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: n.contractor_id,
        title: n.title,
        body: n.body ?? '',
        url: n.url ?? '/pro',
      }),
    });
  } catch (e) {
    console.warn('[pro-notify] push failed', (e as Error).message);
  }
  return true;
}
