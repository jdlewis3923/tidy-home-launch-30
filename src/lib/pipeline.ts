/**
 * Contractor pipeline — the seven fixed stages. The database owns the rules
 * (pipeline_* functions); this file only names and labels them for screens.
 * No screen may write a stage: every move goes through supabase.rpc("pipeline_*").
 */
export const PIPELINE_STAGES = [
  { key: "applied", label: "Applied", cost: 0 },
  { key: "screened", label: "Screened", cost: 0 },
  { key: "agreement", label: "Agreement", cost: 0 },
  { key: "ins_quote", label: "Insurance quote", cost: 0 },
  { key: "background", label: "Background check", cost: 6449 },
  { key: "insured", label: "Insured", cost: 0 },
  { key: "active", label: "Active", cost: 6000 },
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number]["key"];

export const stageIndex = (s: string) => PIPELINE_STAGES.findIndex((x) => x.key === s);
export const stageLabel = (s: string) => PIPELINE_STAGES.find((x) => x.key === s)?.label ?? s;
export const nextStage = (s: string): PipelineStage | null => {
  const i = stageIndex(s);
  return i >= 0 && i < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[i + 1].key : null;
};

export const PIPELINE_SERVICES = [
  { key: "cleaning", label: "Cleaning" },
  { key: "lawn", label: "Lawn" },
  { key: "car_care", label: "Car Care" },
] as const;
export const serviceLabel = (s: string | null | undefined) =>
  PIPELINE_SERVICES.find((x) => x.key === s)?.label ?? "No service";

export const DECLINE_REASONS = [
  "No equipment",
  "Out of range (over 30 minutes)",
  "Unresponsive",
  "Not a fit",
  "Background check",
  "Other",
] as const;

export const ARTIFACT_LABEL: Record<string, string> = {
  ica_signed: "Signed ICA",
  w9: "W-9",
  insurance_quote: "Insurance quote",
  checkr_report: "Checkr report",
  coi: "Certificate of insurance",
};

export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Postgres RAISE text arrives as error.message; strip the internal prefix. */
export const rpcMessage = (e: { message?: string } | null | undefined) =>
  (e?.message ?? "Something went wrong").replace(/^pipeline:\s*/, "");

export const BUSINESS_DAYS_FOR_ADVERSE = 5;
