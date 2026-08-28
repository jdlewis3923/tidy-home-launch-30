// TEMPORARY one-off admin utility: audit/set lookup_key on Stripe prices.
// Dry run by default; pass ?apply=1 to write.
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

async function stripeGet(path: string): Promise<any> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `stripe_${r.status}`);
  return j;
}

async function stripePost(path: string, params: Record<string, string>): Promise<any> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `stripe_${r.status}`);
  return j;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const url = new URL(req.url);
  const apply = url.searchParams.get("apply") === "1";
  const setsRaw = url.searchParams.get("sets"); // "price_x:key_x,price_y:key_y"

  try {
    // Page through all prices with product expanded.
    const all: any[] = [];
    let starting_after: string | undefined;
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({ limit: "100", "expand[]": "data.product" });
      if (starting_after) q.set("starting_after", starting_after);
      const page = await stripeGet(`prices?${q.toString()}`);
      all.push(...page.data);
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1].id;
    }

    const rows = all.map((p) => ({
      id: p.id,
      active: p.active,
      lookup_key: p.lookup_key,
      nickname: p.nickname,
      unit_amount: p.unit_amount,
      interval: p.recurring?.interval ?? null,
      product_name: typeof p.product === "object" ? p.product?.name : p.product,
    }));

    const applied: any[] = [];
    if (apply && setsRaw) {
      for (const pair of setsRaw.split(",")) {
        const [pid, key] = pair.split(":");
        if (!pid || !key) continue;
        const updated = await stripePost(`prices/${pid}`, { lookup_key: key, transfer_lookup_key: "true" });
        applied.push({ id: updated.id, lookup_key: updated.lookup_key });
      }
    }

    return jsonResponse({ ok: true, count: rows.length, rows, applied });
  } catch (err) {
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
