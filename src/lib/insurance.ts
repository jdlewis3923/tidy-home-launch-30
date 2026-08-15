/**
 * Contractor insurance — single source of truth for the frontend.
 *
 * Coverage requirements, the Tidy Additional Insured entity, and the Thimble
 * partner destination all live in the backend `app_settings` table and are read
 * through the public `insurance-config` edge function, so Tidy can change them
 * later without a rebuild. Nothing secret is exposed here.
 *
 * THIMBLE PARTNER CONFIGURATION REQUIRED
 * --------------------------------------
 * `thimble.enabled` stays false until Tidy sets, in app_settings.thimble_config:
 *   enabled       -> true
 *   partner_url   -> the official Thimble partner/referral destination
 *   partner_id / affiliate_id -> whatever Thimble issues (kept server-side)
 *   embed_supported -> true only if Thimble officially supports embedding
 * Until then the CTA renders in a disabled "coming soon" state — no fabricated
 * URL, no broken button.
 */
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/track";

export type InsuranceStatus =
  | "not_started"
  | "pending_verification"
  | "verified"
  | "rejected"
  | "update_requested"
  | "expiring_soon"
  | "expired";

export type AdditionalInsuredStatus =
  | "unknown"
  | "not_listed"
  | "requested"
  | "listed"
  | "not_applicable";

export type InsuranceConfig = {
  requirements: {
    per_occurrence_cents: number;
    aggregate_cents: number;
    currency?: string;
    policy_type?: string;
  };
  additional_insured: {
    required?: boolean;
    entity_name?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    note?: string;
  };
  thimble: { enabled: boolean; partner_url: string; embed_supported: boolean };
};

export const FALLBACK_CONFIG: InsuranceConfig = {
  requirements: { per_occurrence_cents: 100_000_000, aggregate_cents: 200_000_000 },
  additional_insured: { required: true },
  thimble: { enabled: false, partner_url: "", embed_supported: false },
};

/** Reads the public insurance configuration. Never throws. */
export async function fetchInsuranceConfig(): Promise<InsuranceConfig> {
  try {
    const { data, error } = await supabase.functions.invoke("insurance-config", { body: {} });
    if (error || !data) return FALLBACK_CONFIG;
    return { ...FALLBACK_CONFIG, ...(data as InsuranceConfig) };
  } catch {
    return FALLBACK_CONFIG;
  }
}

export const usd = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export const STATUS_LABEL: Record<InsuranceStatus, string> = {
  not_started: "Not started",
  pending_verification: "Pending verification",
  verified: "Verified",
  rejected: "Rejected",
  update_requested: "Update requested",
  expiring_soon: "Expiring soon",
  expired: "Expired",
};

/** Insurance funnel analytics. Never pass policy numbers or file contents. */
export type InsuranceEvent =
  | "insurance_step_viewed"
  | "insurance_already_covered_selected"
  | "insurance_thimble_selected"
  | "insurance_coi_uploaded"
  | "insurance_submitted"
  | "insurance_verified"
  | "insurance_update_requested"
  | "insurance_rejected";

export function trackInsurance(event: InsuranceEvent, payload: Record<string, string | number | boolean | undefined> = {}) {
  track(event, payload);
}

/** Reads a File as a base64 payload for the submit-insurance edge function. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export const COI_ACCEPT = "application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp";
export const COI_MAX_BYTES = 8 * 1024 * 1024;
