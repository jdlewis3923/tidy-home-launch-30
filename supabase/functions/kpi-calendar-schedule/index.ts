// Pre-schedules the day-90 retrospective on Justin's Google Calendar via the connector gateway.
// Idempotent: skips creation if an event with the same summary already exists in the target window.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const RETRO_SUMMARY = "Tidy — Day 90 KPI Retrospective";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  if (!LOVABLE_API_KEY || !GOOGLE_CALENDAR_API_KEY) {
    return new Response(JSON.stringify({ error: "Calendar connector not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Day 90 from today.
  const start = new Date();
  start.setDate(start.getDate() + 90);
  start.setHours(15, 0, 0, 0); // 3pm local
  const end = new Date(start);
  end.setHours(16, 30, 0, 0);

  // Idempotency check
  const checkParams = new URLSearchParams({
    timeMin: new Date(start.getTime() - 86400000).toISOString(),
    timeMax: new Date(start.getTime() + 86400000).toISOString(),
    q: RETRO_SUMMARY,
    singleEvents: "true",
  });
  const existing = await fetch(`${GATEWAY_URL}/calendars/primary/events?${checkParams}`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
    },
  }).then((r) => r.json()).catch(() => ({ items: [] }));

  if ((existing.items ?? []).some((e: { summary?: string }) => e.summary === RETRO_SUMMARY)) {
    return new Response(JSON.stringify({ skipped: "already scheduled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const event = {
    summary: RETRO_SUMMARY,
    description:
      "Review 90 days of KPI snapshots. Open /admin/kpis. Discuss top-3 wins, top-3 misses, next-quarter targets.",
    start: { dateTime: start.toISOString(), timeZone: "America/New_York" },
    end: { dateTime: end.toISOString(), timeZone: "America/New_York" },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 * 24 }] },
  };

  const res = await fetch(`${GATEWAY_URL}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });
  const data = await res.json();
  return new Response(JSON.stringify({ ok: res.ok, event: data }), {
    status: res.ok ? 200 : 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
