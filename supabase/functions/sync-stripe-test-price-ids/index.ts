// Fills stripe_catalog.stripe_price_id_test from the Stripe TEST account.
//
// The catalog stores live price ids. A test-mode booking needs the test twin of
// each price, matched by the same lookup key, so nothing about live changes.
// Admin or service-role only. Creates and archives nothing.

import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireAdmin } from "../_shared/admin-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_TEST_SECRET_KEY = Deno.env.get("STRIPE_TEST_SECRET_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if (!auth.ok) return json({ ok: false, error: "unauthorized" }, 401);
  if (!STRIPE_TEST_SECRET_KEY) return json({ ok: false, error: "STRIPE_TEST_SECRET_KEY missing" }, 500);

  const stripe = new Stripe(STRIPE_TEST_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await supabase
    .from("stripe_catalog")
    .select("id, lookup_key, stripe_price_id, price_cents")
    .eq("active", true)
    .not("lookup_key", "is", null);
  if (error) return json({ ok: false, error: error.message }, 500);

  const matched: Record<string, string> = {};
  const missing: string[] = [];

  for (const row of rows ?? []) {
    const key = row.lookup_key as string;
    const found = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    const price = found.data[0];
    if (!price) {
      missing.push(key);
      continue;
    }
    matched[key] = price.id;
    await supabase.from("stripe_catalog").update({ stripe_price_id_test: price.id }).eq("id", row.id);
  }

  return json({ ok: true, matched_count: Object.keys(matched).length, matched, missing });
});
