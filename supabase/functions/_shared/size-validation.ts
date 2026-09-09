// Server-side size recomputation.
//
// The browser computes a size so it can show a price, but the server must never
// trust it: a POST claiming size 1 for a 4-bed/3-bath home would bill $139
// instead of $279 and freeze the pro's pay at the wrong figure forever, because
// pay is snapshotted when the visit is created.
//
// Every checkout path sends the UNDERLYING inputs (bedrooms, bathrooms, the lawn
// answer or turf area, the vehicle class) and we recompute here. A mismatch, or
// missing inputs, is rejected.

import {
  CLEANING_SURCHARGE,
  LAWN_SURCHARGE,
  VEHICLE_CLASS_SIZE,
  sizeFromBedrooms,
  sizeFromTurfSqFt,
  type CanonService,
  type SizeSelection,
  type VehicleClass,
} from "./pricing-canon.ts";

export type LawnChoice = "small" | "standard" | "large" | "over";

export interface SizeInputs {
  bedrooms?: number | null;
  bathrooms?: number | null;
  lawn_choice?: LawnChoice | null;
  turf_sq_ft?: number | null;
  vehicle_class?: VehicleClass | null;
}

export function sizeFromLawnChoice(choice: LawnChoice): SizeSelection {
  if (choice === "over") return "quote";
  return choice === "small" ? 1 : choice === "standard" ? 2 : 3;
}

/**
 * The size the server derives, or null when the inputs are not sufficient.
 *
 * Lawn carries TWO independent encodings of the same bands — the by-eye answer
 * and the measured turf area. They must agree; when they don't we take the
 * LARGER band so a "small yard" answer can never buy a 7,000 sq ft yard.
 */
export function recomputeSize(service: CanonService, inputs: SizeInputs): SizeSelection | null {
  if (service === "cleaning") {
    const beds = inputs.bedrooms ?? 0;
    const baths = inputs.bathrooms ?? 0;
    if (!beds || !baths) return null;
    return sizeFromBedrooms(beds, baths);
  }
  if (service === "lawn") {
    const fromChoice = inputs.lawn_choice ? sizeFromLawnChoice(inputs.lawn_choice) : null;
    const fromTurf = inputs.turf_sq_ft ? sizeFromTurfSqFt(inputs.turf_sq_ft) : null;
    if (fromChoice === null && fromTurf === null) return null;
    if (fromChoice === "quote" || fromTurf === "quote") return "quote";
    return Math.max(
      typeof fromChoice === "number" ? fromChoice : 0,
      typeof fromTurf === "number" ? fromTurf : 0,
    ) as SizeSelection;
  }
  if (!inputs.vehicle_class) return null;
  return VEHICLE_CLASS_SIZE[inputs.vehicle_class] ?? null;
}

export interface SizeCheckResult {
  ok: boolean;
  /** Machine-readable reason when ok is false. */
  error?:
    | "size_inputs_missing"
    | "size_mismatch"
    | "property_requires_quote"
    | "sq_ft_required";
  detail?: string;
}


/**
 * Validates one service line: the claimed size must equal the recomputed one,
 * and a property above every purchasable band must go to the quote form.
 */
export function checkServiceLine(args: {
  service: CanonService;
  claimedSize: number;
  sqFt?: number | null;
  inputs: SizeInputs;
}): SizeCheckResult {
  const { service, claimedSize, sqFt, inputs } = args;
  // Square footage is REQUIRED for the two per-visit services: it is the only
  // input that triggers the surcharge (cleaning +$60, lawn +$30 a visit) and
  // the pro's surcharge share. A blank field used to buy the smaller price.
  if ((service === "cleaning" || service === "lawn") && !sqFt) {
    return { ok: false, error: "sq_ft_required", detail: service };
  }
  const recomputed = recomputeSize(service, inputs);
  if (recomputed === null) {
    return { ok: false, error: "size_inputs_missing", detail: service };
  }

  if (recomputed === "quote") {
    return { ok: false, error: "property_requires_quote", detail: service };
  }
  if (recomputed !== claimedSize) {
    return {
      ok: false,
      error: "size_mismatch",
      detail: `${service}: claimed ${claimedSize}, server computed ${recomputed}`,
    };
  }
  // Above the surcharge band nothing is purchasable — it is quoted by hand.
  if (service === "cleaning" && sqFt && sqFt > CLEANING_SURCHARGE.maxSqFt) {
    return { ok: false, error: "property_requires_quote", detail: "cleaning_sq_ft" };
  }
  if (service === "lawn" && sqFt && sqFt > LAWN_SURCHARGE.maxSqFt) {
    return { ok: false, error: "property_requires_quote", detail: "lawn_turf_sq_ft" };
  }
  return { ok: true };
}

/** Per-visit surcharge dollars for a line. Callers already rejected the quote band. */
export function surchargePerVisitFor(service: CanonService, sqFt?: number | null): number {
  if (!sqFt) return 0;
  if (service === "cleaning") {
    return sqFt >= CLEANING_SURCHARGE.minSqFt && sqFt <= CLEANING_SURCHARGE.maxSqFt
      ? CLEANING_SURCHARGE.perVisitDollars
      : 0;
  }
  if (service === "lawn") {
    return sqFt >= LAWN_SURCHARGE.minSqFt && sqFt <= LAWN_SURCHARGE.maxSqFt
      ? LAWN_SURCHARGE.perVisitDollars
      : 0;
  }
  return 0;
}
