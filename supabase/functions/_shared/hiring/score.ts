/**
 * Applicant scoring — a pure function, deliberately free of any I/O.
 *
 * The six hard gates are tri-state. "no" disqualifies. "unknown" never
 * disqualifies; it produces a "confirm on call" flag so the gate gets asked
 * on the phone instead of being silently assumed.
 */
import { driveMinutes } from "./geo.ts";

export type Tri = "yes" | "no" | "unknown";
export type HiringService = "cleaning" | "lawn" | "car_care" | "ops_coordinator";
export type Tier = "A" | "B" | "C";

export type QueueState =
  | "not_contacted"
  | "texted"
  | "follow_up_due"
  | "followed_up"
  | "replied"
  | "call_booked"
  | "interviewed"
  | "hold"
  | "declined"
  | "cold"
  | "disqualified"
  | "checkr"
  | "insurance"
  | "hired";

export const GATES = [
  "bilingual",
  "drivers_license",
  "work_authorized",
  "own_equipment",
  "background_check_ok",
  "reads_texts",
] as const;
export type Gate = (typeof GATES)[number];

export const GATE_LABEL: Record<Gate, string> = {
  bilingual: "bilingual (English + Spanish)",
  drivers_license: "driver's license",
  work_authorized: "work authorization",
  own_equipment: "own equipment",
  background_check_ok: "background check",
  reads_texts: "reads and replies to texts",
};

export interface ScoreInput {
  service: HiringService | string | null;
  city_or_zip?: string | null;
  applied_on?: string | null;
  years_in_service?: number | null;
  owner_operator?: boolean | null;
  has_insurance?: boolean | null;
  trade_job_current?: boolean | null;
  experience_matches_resume?: Tri | string | null;
  tier_hint?: Tier | string | null;
  notes?: string | null;
  /** Tri-state gates. */
  bilingual?: Tri | string | null;
  drivers_license?: Tri | string | null;
  work_authorized?: Tri | string | null;
  own_equipment?: Tri | string | null;
  background_check_ok?: Tri | string | null;
  reads_texts?: Tri | string | null;
  /** Current queue state — preserved unless a gate or drive time overrides it. */
  queue_state?: QueueState | string | null;
}

export interface ScoreResult {
  score: number;
  tier: Tier;
  flags: string[];
  drive_minutes: number | null;
  queue_state: QueueState;
}

function tri(v: unknown): Tri {
  return v === "yes" || v === true ? "yes" : v === "no" || v === false ? "no" : "unknown";
}

function tierFor(score: number): Tier {
  if (score >= 60) return "A";
  if (score >= 40) return "B";
  return "C";
}

const TIER_HINT_BASE: Record<Tier, number> = { A: 62, B: 45, C: 25 };

function hasAnySignal(i: ScoreInput): boolean {
  return (
    i.years_in_service != null ||
    i.owner_operator != null ||
    i.has_insurance != null ||
    i.trade_job_current != null ||
    (i.experience_matches_resume != null && i.experience_matches_resume !== "") ||
    GATES.some((g) => tri(i[g]) !== "unknown")
  );
}

export function scoreApplicant(input: ScoreInput, now: Date = new Date()): ScoreResult {
  const flags: string[] = [];

  // ---- hard gates
  let disqualified = false;
  for (const gate of GATES) {
    const value = tri(input[gate]);
    if (value === "no") {
      disqualified = true;
      flags.push(`fails gate: ${GATE_LABEL[gate]}`);
    } else if (value === "unknown") {
      flags.push(`confirm on call: ${GATE_LABEL[gate]}`);
    }
  }

  // ---- drive time
  const minutes = driveMinutes(input.city_or_zip);
  let drivePoints = 0;
  let overThirty = false;
  if (minutes == null) {
    flags.push("confirm where they live");
  } else if (minutes > 30) {
    overThirty = true;
    flags.push("over 30 min");
  } else if (minutes <= 15) {
    drivePoints = 20;
  } else if (minutes <= 20) {
    drivePoints = 10;
  } else {
    drivePoints = -10;
    flags.push("over 20 min");
  }

  // ---- points
  let score: number;
  if (!hasAnySignal(input)) {
    const hint = (input.tier_hint as Tier) ?? "C";
    score = TIER_HINT_BASE[hint] ?? TIER_HINT_BASE.C;
  } else {
    score = drivePoints;

    const years = Number(input.years_in_service ?? 0);
    if (years > 0) {
      const notes = (input.notes ?? "").toLowerCase();
      const commercialOnly =
        input.service === "cleaning" &&
        /hotel|office|commercial/.test(notes);
      const perYear = commercialOnly ? 2 : 4;
      score += Math.min(30, Math.round(years * perYear));
    }

    if (input.owner_operator) {
      score += input.service === "cleaning" ? 8 : 15;
    }
    if (input.has_insurance) score += 10;
    if (input.trade_job_current) score += 10;

    if (input.applied_on) {
      const applied = new Date(`${input.applied_on}T12:00:00Z`).getTime();
      if (Number.isFinite(applied) && now.getTime() - applied <= 72 * 3600_000) {
        score += 8;
      }
    }

    if (tri(input.experience_matches_resume) === "no") {
      score -= 15;
      flags.push("ask where the experience came from");
    }
  }

  const current = (input.queue_state as QueueState) ?? "not_contacted";
  let queue_state: QueueState = current;
  if (disqualified) queue_state = "disqualified";
  else if (overThirty && current === "not_contacted") queue_state = "hold";

  return {
    score: Math.round(score),
    tier: tierFor(score),
    flags,
    drive_minutes: minutes,
    queue_state,
  };
}
