/**
 * Contractor insurance — single source of truth for the frontend.
 *
 * Everything configurable (coverage limits per service category, the Tidy
 * Additional Insured entity, reminder intervals, and the list of insurance
 * providers) lives in the backend and is read through the public
 * `insurance-config` edge function. Nothing secret is exposed here.
 *
 * EXTERNAL CONFIGURATION REQUIRED — THIMBLE
 * -----------------------------------------
 * The `thimble` provider row in `public.insurance_providers` stays disabled
 * until Tidy receives partnership credentials from https://www.thimble.com/partner
 * and sets, on that row:
 *   enabled         -> true
 *   integration_type -> 'iframe_embed' (only if Thimble officially supports it) or 'referral_link'
 *   embed_url        -> the official Thimble embed URL (includes partner/affiliate params)
 *   referral_url     -> the official Thimble referral destination
 *   embed_supported  -> true only when Thimble authorises embedding
 * Until then the CTA renders in a disabled "coming soon" state and the applicant
 * is offered the "use existing insurance" path — never a fabricated URL.
 */
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/track";

export type InsuranceStatus =
  | "not_started"
  | "coverage_needed"
  | "pending_verification"
  | "verified"
  | "rejected"
  | "update_requested"
  | "expiring_soon"
  | "expired"
  | "waived";

export type AdditionalInsuredStatus =
  | "unknown"
  | "not_listed"
  | "requested"
  | "listed"
  | "not_applicable";

export type ServiceCategory = "cleaning" | "lawn" | "detailing";

export type InsuranceRequirement = {
  service_category: string;
  per_occurrence_cents: number;
  aggregate_cents: number;
  additional_insured_required: boolean;
  accepted_policy_types: string[];
  reminder_days: number[];
  manual_verification_required: boolean;
};

export type InsuranceProvider = {
  provider_key: string;
  display_name: string;
  provider_type: string;
  integration_type: "referral_link" | "iframe_embed" | "api" | "manual";
  enabled: boolean;
  is_preferred: boolean;
  referral_url: string;
  embed_url: string;
  embed_supported: boolean;
  supported_service_categories: string[];
  display_order: number;
  disclosure_text: string;
};

export type InsuranceConfig = {
  requirements: {
    per_occurrence_cents: number;
    aggregate_cents: number;
    currency?: string;
    policy_type?: string;
  };
  requirements_by_service: Record<string, InsuranceRequirement>;
  additional_insured: {
    required?: boolean;
    entity_name?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    note?: string;
  };
  providers: InsuranceProvider[];
  /** Back-compat convenience view of the preferred provider. */
  thimble: { enabled: boolean; partner_url: string; embed_supported: boolean };
};

export const FALLBACK_CONFIG: InsuranceConfig = {
  requirements: { per_occurrence_cents: 100_000_000, aggregate_cents: 200_000_000 },
  requirements_by_service: {},
  additional_insured: { required: true },
  providers: [],
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

/** Requirement for one service category, falling back to the global default. */
export function requirementFor(
  config: InsuranceConfig,
  serviceCategory?: string | null,
): { per_occurrence_cents: number; aggregate_cents: number; additional_insured_required: boolean } {
  const r = serviceCategory ? config.requirements_by_service?.[serviceCategory] : undefined;
  return {
    per_occurrence_cents: r?.per_occurrence_cents ?? config.requirements.per_occurrence_cents,
    aggregate_cents: r?.aggregate_cents ?? config.requirements.aggregate_cents,
    additional_insured_required:
      r?.additional_insured_required ?? Boolean(config.additional_insured?.required),
  };
}

/** The preferred, enabled provider (if any). */
export function preferredProvider(config: InsuranceConfig): InsuranceProvider | undefined {
  const enabled = (config.providers ?? []).filter((p) => p.enabled && p.provider_key !== "other");
  return enabled.find((p) => p.is_preferred) ?? enabled[0];
}

export const usd = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/** Masks all but the last 4 characters of a policy number. */
export function maskPolicy(value?: string | null): string {
  const v = String(value ?? "").trim();
  if (!v) return "—";
  if (v.length <= 4) return `••••${v}`;
  return `••••${v.slice(-4)}`;
}

export const STATUS_LABEL: Record<InsuranceStatus, string> = {
  not_started: "Not started",
  coverage_needed: "Coverage needed",
  pending_verification: "Pending verification",
  verified: "Verified",
  rejected: "Rejected",
  update_requested: "Update requested",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  waived: "Waived by Tidy",
};

/** Insurance funnel analytics. Never pass policy numbers or file contents. */
export type InsuranceEvent =
  | "insurance_step_viewed"
  | "already_insured_selected"
  | "needs_insurance_selected"
  | "thimble_quote_started"
  | "insurance_document_uploaded"
  | "insurance_verification_submitted"
  | "insurance_verified"
  | "insurance_rejected"
  | "insurance_expiring"
  | "insurance_expired"
  | "insurance_renewed";

export function trackInsurance(
  event: InsuranceEvent,
  payload: Record<string, string | number | boolean | undefined> = {},
) {
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
