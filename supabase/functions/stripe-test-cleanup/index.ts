// Cancels every subscription in the Stripe TEST account. Test mode only —
// it never loads the live key, so it cannot touch a paying customer.
// Admin or service role only.

import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireServiceOrAdmin } from "../_shared/admin-auth.ts";

const STRIPE_TEST_SECRET_KEY = Deno.env.get("STRIPE_TEST_SECRET_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return json({ ok: false, error: "unauthorized" }, 401);
  if (!STRIPE_TEST_SECRET_KEY) return json({ ok: false, error: "STRIPE_TEST_SECRET_KEY missing" }, 500);

  const stripe = new Stripe(STRIPE_TEST_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const canceled: Array<{ id: string; total_cents: number | null; items: string[] }> = [];
  const list = await stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.items"] });
  for (const sub of list.data) {
    const items = sub.items.data.map((i) => `${i.price.id} x${i.quantity ?? 1}`);
    if (sub.status !== "canceled") await stripe.subscriptions.cancel(sub.id);
    canceled.push({
      id: sub.id,
      total_cents: sub.items.data.reduce((n, i) => n + (i.price.unit_amount ?? 0) * (i.quantity ?? 1), 0),
      items,
    });
  }
  return json({ ok: true, count: canceled.length, canceled });
});
