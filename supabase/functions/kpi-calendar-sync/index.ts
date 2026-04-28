// Pulls today's events from Justin's primary Google Calendar via the Lovable connector gateway.
// Used to compute calendar-derived KPIs (e.g., owner_focus_blocks) and to attach context to alerts.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  if (!LOVABLE_API_KEY || !GOOGLE_CALENDAR_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Calendar connector not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  try {
    const res = await fetch(`${GATEWAY_URL}/calendars/primary/events?${params}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
      },
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "calendar fetch failed", data }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = (data.items ?? []) as Array<{ summary?: string; start?: { dateTime?: string } }>;
    const focusBlocks = items.filter((e) =>
      /focus|deep work|kpi|retro/i.test(e.summary ?? "")
    ).length;

    return new Response(
      JSON.stringify({
        total_events: items.length,
        focus_blocks: focusBlocks,
        events: items.map((e) => ({ summary: e.summary, start: e.start?.dateTime })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
