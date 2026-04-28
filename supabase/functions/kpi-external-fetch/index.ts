// Fetches external KPI data (GA4, Google Ads, Meta, Jobber, GBP) and writes snapshots.
// Most external APIs require additional secrets — handlers gracefully no-op until configured.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Status = "green" | "warn" | "critical" | "unknown";

interface ExternalResult {
  kpi_code: string;
  value: number | null;
  status: Status;
  context: Record<string, unknown>;
}

async function fetchGA4Sessions(): Promise<ExternalResult> {
  const propertyId = Deno.env.get("GA4_PROPERTY_ID");
  const measurementId = Deno.env.get("GA4_MEASUREMENT_ID");
  if (!propertyId) {
    return {
      kpi_code: "site_sessions",
      value: null,
      status: "unknown",
      context: { skipped: "GA4_PROPERTY_ID not configured", measurementId },
    };
  }
  // Real Data API call requires service-account JWT. Stub returns null; queue as TODO.
  return {
    kpi_code: "site_sessions",
    value: null,
    status: "unknown",
    context: { note: "GA4 Data API service-account JWT not yet wired", propertyId },
  };
}

async function fetchGoogleAdsSpend(): Promise<ExternalResult> {
  const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID");
  if (!customerId) {
    return {
      kpi_code: "ads_spend_daily",
      value: null,
      status: "unknown",
      context: { skipped: "GOOGLE_ADS_CUSTOMER_ID not configured" },
    };
  }
  return {
    kpi_code: "ads_spend_daily",
    value: null,
    status: "unknown",
    context: { note: "Google Ads API OAuth not yet wired", customerId },
  };
}

async function fetchMetaSpend(): Promise<ExternalResult> {
  const adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");
  const token = Deno.env.get("META_CAPI_ACCESS_TOKEN");
  if (!adAccountId || !token) {
    return {
      kpi_code: "meta_spend_daily",
      value: null,
      status: "unknown",
      context: { skipped: "META_AD_ACCOUNT_ID or token missing" },
    };
  }
  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const sinceStr = since.toISOString().slice(0, 10);
    const url = `https://graph.facebook.com/v20.0/${adAccountId}/insights?fields=spend&time_range=${encodeURIComponent(
      JSON.stringify({ since: sinceStr, until: sinceStr })
    )}&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const spend = parseFloat(data?.data?.[0]?.spend ?? "0");
    return {
      kpi_code: "meta_spend_daily",
      value: spend,
      status: spend > 60 ? "critical" : spend > 50 ? "warn" : "green",
      context: { adAccountId, raw: data?.data?.[0] ?? null },
    };
  } catch (e) {
    return {
      kpi_code: "meta_spend_daily",
      value: null,
      status: "unknown",
      context: { error: String(e) },
    };
  }
}

async function fetchJobberJobsToday(): Promise<ExternalResult> {
  const token = Deno.env.get("JOBBER_REFRESH_TOKEN");
  if (!token) {
    return {
      kpi_code: "jobs_completed_today",
      value: null,
      status: "unknown",
      context: { skipped: "Jobber not configured" },
    };
  }
  // Jobber GraphQL access requires fresh access token via refresh-token flow handled elsewhere.
  return {
    kpi_code: "jobs_completed_today",
    value: null,
    status: "unknown",
    context: { note: "Jobber GraphQL fetch not yet wired in KPI loop" },
  };
}

async function fetchGBPRating(): Promise<ExternalResult> {
  const accountId = Deno.env.get("GBP_ACCOUNT_ID");
  if (!accountId) {
    return {
      kpi_code: "gbp_rating",
      value: null,
      status: "unknown",
      context: { skipped: "GBP_ACCOUNT_ID not configured" },
    };
  }
  return {
    kpi_code: "gbp_rating",
    value: null,
    status: "unknown",
    context: { note: "Google Business Profile API OAuth not yet wired" },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const results = await Promise.all([
    fetchGA4Sessions(),
    fetchGoogleAdsSpend(),
    fetchMetaSpend(),
    fetchJobberJobsToday(),
    fetchGBPRating(),
  ]);

  const rows = results.map((r) => ({
    kpi_code: r.kpi_code,
    value: r.value,
    status: r.status,
    context: r.context,
  }));

  const { error } = await supabase.from("kpi_snapshots").insert(rows);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ inserted: rows.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
