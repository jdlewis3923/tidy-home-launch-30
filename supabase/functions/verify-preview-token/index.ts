/**
 * verify-preview-token
 *
 * Staging preview access. The site is gated (site_live = false) and the whole
 * customer journey — /neighbor, /signup, checkout — sits behind ComingSoon, so
 * there is no way to review the funnel before launch without a back door.
 *
 * A visitor opening ?preview=TOKEN posts the token here. The expected value
 * lives ONLY in the PREVIEW_ACCESS_TOKEN secret, server side, so it never ships
 * in the client bundle. On a match the client stores a session cookie and
 * renders the real site for the rest of that browser session. Everyone else
 * keeps seeing "We're almost ready."
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Constant-time compare so a wrong token leaks nothing through timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const av = enc.encode(a);
  const bv = enc.encode(b);
  // Compare a fixed-width digest so differing lengths do not short-circuit.
  if (av.length !== bv.length) {
    let sink = 0;
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      sink |= (av[i] ?? 0) ^ (bv[i] ?? 0);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ valid: false }, 405);

  const expected = Deno.env.get("PREVIEW_ACCESS_TOKEN");
  // Fail closed: with no secret configured, nobody gets preview access.
  if (!expected) return json({ valid: false });

  let token = "";
  try {
    const body = (await req.json()) as { token?: unknown };
    if (typeof body?.token === "string") token = body.token;
  } catch {
    return json({ valid: false }, 400);
  }
  if (!token) return json({ valid: false }, 400);

  return json({ valid: timingSafeEqual(token, expected) });
});
